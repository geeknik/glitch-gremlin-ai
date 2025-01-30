import { WebSocketServer } from 'ws';
import { FuzzingState } from './types.js';
import { Logger } from './logger.js';
import { FuzzingMetricsCollector } from './reinforcement-fuzzing-utils.js';

interface DashboardState {
    currentEpisode: number;
    totalEpisodes: number;
    currentReward: number;
    totalReward: number;
    coverage: number;
    vulnerabilitiesFound: number;
    activeConnections: number;
}

interface DashboardConfig {
    port: number;
    metricsCollector: FuzzingMetricsCollector;
}

export class DashboardServer {
    private readonly wss: WebSocketServer;
    private readonly logger: Logger;
    private readonly metricsCollector: FuzzingMetricsCollector;
    private state: DashboardState;
    private updateInterval?: NodeJS.Timeout;
    private isRunning: boolean = false;

    constructor(config: DashboardConfig) {
        this.logger = new Logger('DashboardServer');
        this.metricsCollector = config.metricsCollector;
        
        // Initialize WebSocket server
        this.wss = new WebSocketServer({ port: config.port });

        // Initialize state
        this.state = {
            currentEpisode: 0,
            totalEpisodes: 0,
            currentReward: 0,
            totalReward: 0,
            coverage: 0,
            vulnerabilitiesFound: 0,
            activeConnections: 0
        };

        this.setupWebSocket();
        this.startServer(config.port);
    }

    private setupWebSocket(): void {
        this.wss.on('connection', (ws) => {
            this.state.activeConnections++;
            this.broadcastState();

            ws.on('message', async (message: Buffer) => {
                try {
                    const data = JSON.parse(message.toString());
                    switch (data.type) {
                        case 'start':
                            await this.start();
                            break;
                        case 'stop':
                            await this.stop();
                            break;
                        default:
                            this.logger.warn(`Unknown message type: ${data.type}`);
                    }
                } catch (error) {
                    this.logger.error('Error processing message:', error);
                }
            });

            ws.on('close', () => {
                this.state.activeConnections--;
                this.broadcastState();
            });
        });
    }

    private startServer(port: number): void {
        this.logger.info(`WebSocket server running on ws://localhost:${port}`);
    }

    public async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        try {
            this.isRunning = true;
            this.startStateUpdates();
            this.logger.info('Dashboard server started');
        } catch (error) {
            this.logger.error('Error starting dashboard server:', error);
            await this.stop();
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            this.isRunning = false;
            this.stopStateUpdates();
            this.wss.close();
            this.logger.info('Dashboard server stopped');
        } catch (error) {
            this.logger.error('Error stopping dashboard server:', error);
        }
    }

    private startStateUpdates(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.updateInterval = setInterval(() => this.updateAndBroadcastState(), 1000);
    }

    private stopStateUpdates(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
    }

    private async updateAndBroadcastState(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            // Get latest metrics from collector
            const metrics = this.metricsCollector.getProgressMetrics();

            // Update state with latest metrics
            this.state = {
                ...this.state,
                currentReward: metrics.avgReward,
                coverage: metrics.codeCoverage,
                vulnerabilitiesFound: metrics.vulnerabilities
            };

            this.broadcastState();
        } catch (error) {
            this.logger.error('Error updating dashboard state:', error);
        }
    }

    private broadcastState(): void {
        const message = JSON.stringify(this.state);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}


