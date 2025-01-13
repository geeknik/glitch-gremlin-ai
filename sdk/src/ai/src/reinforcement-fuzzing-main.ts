import { Command } from 'commander';
import winston from 'winston';
import { WebSocketServer } from 'ws';
import { RLFuzzingModel } from './reinforcement-fuzzing';
import { MetricsCollector } from './reinforcement-fuzzing-utils';
import { DashboardServer } from './dashboard-server';

// Configuration types
interface SystemConfig {
port: number;
logLevel: string;
modelPath?: string;
metricsInterval: number;
maxConcurrentFuzzing: number;
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
private model: RLFuzzingModel;
private dashboardServer: DashboardServer;
private metricsCollector: MetricsCollector;
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

    // Initialize RL model
    this.model = new RLFuzzingModel({
        modelPath: this.config.modelPath,
        maxConcurrent: this.config.maxConcurrentFuzzing
    });
    await this.model.initialize();

    // Setup metrics collection
    this.metricsCollector = new MetricsCollector({
        interval: this.config.metricsInterval
    });
    this.metricsCollector.attachModel(this.model);

    // Initialize dashboard server
    this.dashboardServer = new DashboardServer({
        port: this.config.port,
        metricsCollector: this.metricsCollector
    });
    await this.dashboardServer.start();

    logger.info('Fuzzing system initialized successfully');
    } catch (error) {
    logger.error('Failed to initialize fuzzing system', error);
    throw error;
    }
}

async start(): Promise<void> {
    try {
    logger.info('Starting fuzzing operations...');
    await this.model.startFuzzing();
    this.metricsCollector.startCollection();
    } catch (error) {
    logger.error('Error during fuzzing operation', error);
    await this.shutdown();
    }
}

async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Initiating graceful shutdown...');

    try {
    // Stop metrics collection
    if (this.metricsCollector) {
        await this.metricsCollector.stop();
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
.parse(process.argv);

const options = program.opts();

// Main execution
async function main() {
const config: SystemConfig = {
    port: parseInt(options.port),
    logLevel: options.logLevel,
    modelPath: options.modelPath,
    metricsInterval: parseInt(options.metricsInterval),
    maxConcurrentFuzzing: parseInt(options.maxConcurrent)
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

