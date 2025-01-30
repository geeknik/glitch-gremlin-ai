import { Command } from 'commander';
import { TestType } from './types.js';
import { GlitchError } from '../../errors.js';
import winston from 'winston';
import { Server as WebSocketServer } from 'ws';
import { RLFuzzingModel, RLFuzzingConfig } from './reinforcement-fuzzing.js';
import { FuzzingMetricsCollector } from './reinforcement-fuzzing-utils.js';
import { DashboardServer } from './dashboard-server.js';
import { AIError } from './errors.js';

// Configuration types
interface SystemConfig {
    port: number;
    logLevel: string;
    modelPath?: string;
    metricsInterval: number;
    maxConcurrentFuzzing: number;
    outputDir: string;
    rrdPath: string;
}

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'fuzzing.log' })
    ]
});

class FuzzingSystem {
    private model!: RLFuzzingModel;
    private dashboardServer!: DashboardServer;
    private metricsCollector!: FuzzingMetricsCollector;
    private isShuttingDown: boolean = false;

    constructor(private config: SystemConfig) {
        this.setupShutdownHandlers();
    }

    private setupShutdownHandlers(): void {
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error);
            this.shutdown();
        });
    }

    async initialize(): Promise<void> {
        try {
            logger.info('Initializing fuzzing system...');

            // Initialize RL model with proper configuration
            const modelConfig: RLFuzzingConfig = {
                stateSize: 128,  // Feature vector size for state representation
                actionSize: 3,   // mutate, crossover, reset
                maxConcurrentFuzzing: this.config.maxConcurrentFuzzing,
                batchSize: 32,
                gamma: 0.95,     // Discount factor for future rewards
                epsilonMin: 0.01, // Minimum exploration rate
                epsilonDecay: 0.995, // Exploration rate decay
                targetUpdateFrequency: 10 // Update target network every 10 steps
            };
            this.model = new RLFuzzingModel(modelConfig);
            await this.model.initialize();

            // Setup metrics collection with proper configuration
            this.metricsCollector = new FuzzingMetricsCollector({
                outputDir: this.config.outputDir,
                rrdPath: this.config.rrdPath,
                updateInterval: this.config.metricsInterval,
                maxEpisodes: 1000,
                convergenceThreshold: 0.05,
                minEpisodesForConvergence: 500,
                rewardWindowSize: 100,
                retentionPeriods: {
                    realtime: '1m:1h',
                    hourly: '1h:1d',
                    daily: '1d:30d',
                    monthly: '30d:1y'
                },
                graphOptions: {
                    width: 800,
                    height: 400,
                    colors: {
                        background: '#1a1a1a',
                        grid: '#2a2a2a',
                        text: '#ffffff',
                        line: ['#00ff00', '#ff0000', '#0000ff', '#ffff00']
                    }
                }
            });

            // Initialize dashboard server
            this.dashboardServer = new DashboardServer({
                port: this.config.port,
                metricsCollector: this.metricsCollector
            });
            await this.dashboardServer.start();

            logger.info('Fuzzing system initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize fuzzing system:', error);
            throw new AIError('Failed to initialize fuzzing system', 'INIT_ERROR');
        }
    }

    async start(): Promise<void> {
        try {
            logger.info('Starting fuzzing operations...');
            await this.model.startFuzzing();
            await this.metricsCollector.startCollection();
        } catch (error) {
            logger.error('Error during fuzzing operation:', error);
            await this.shutdown();
            throw new AIError('Failed to start fuzzing operations', 'START_ERROR');
        }
    }

    async shutdown(): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        logger.info('Initiating graceful shutdown...');

        try {
            // Stop metrics collection
            if (this.metricsCollector) {
                await this.metricsCollector.stopCollection();
            }

            // Stop the model
            if (this.model) {
                await this.model.shutdown();
            }

            // Stop dashboard server
            if (this.dashboardServer) {
                await this.dashboardServer.stop();
            }

            logger.info('Shutdown completed successfully');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown', error);
            process.exit(1);
        }
    }
}

// CLI configuration
const program = new Command();

program
    .name('reinforcement-fuzzing')
    .description('AI-powered security fuzzing system')
    .version('1.0.0')
    .option('-p, --port <number>', 'Dashboard server port', '3000')
    .option('-l, --log-level <level>', 'Log level', 'info')
    .option('-m, --model-path <path>', 'Path to saved model')
    .option('-i, --metrics-interval <ms>', 'Metrics collection interval', '1000')
    .option('-c, --max-concurrent <number>', 'Maximum concurrent fuzzing tasks', '4')
    .option('-o, --output-dir <path>', 'Output directory for metrics', './metrics')
    .option('-r, --rrd-path <path>', 'RRD database path', './rrd')
    .parse(process.argv);

const options = program.opts();

// Main execution
async function main() {
    const config: SystemConfig = {
        port: parseInt(options.port),
        logLevel: options.logLevel,
        modelPath: options.modelPath,
        metricsInterval: parseInt(options.metricsInterval),
        maxConcurrentFuzzing: parseInt(options.maxConcurrent),
        outputDir: options.outputDir,
        rrdPath: options.rrdPath
    };

    logger.level = config.logLevel;

    const system = new FuzzingSystem(config);

    try {
        await system.initialize();
        await system.start();
    } catch (error) {
        logger.error('Failed to start fuzzing system', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        logger.error('Fatal error', error);
        process.exit(1);
    });
}

