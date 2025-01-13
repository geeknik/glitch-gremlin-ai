import { Server } from 'socket.io';
import { createServer } from 'http';
import { RLFuzzingModel } from './reinforcement-fuzzing';

interface DashboardMetrics {
    timestamp: number;
    episodeReward: number;
    loss: number;
    epsilon: number;
    coverage: number;
    memoryUsage: number;
    uniqueCrashes: number;
}

interface MetricsBuffer {
    metrics: DashboardMetrics[];
    maxSize: number;
    currentIndex: number;
}

export class DashboardServer {
    private io: Server;
    private metricsBuffer: MetricsBuffer;
    private connectedClients: Set<string>;
    private isCollecting: boolean;
    private collectInterval?: NodeJS.Timer;

    constructor(port: number = 3000, bufferSize: number = 1000) {
        const httpServer = createServer();
        this.io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.metricsBuffer = {
            metrics: new Array(bufferSize),
            maxSize: bufferSize,
            currentIndex: 0
        };

        this.connectedClients = new Set();
        this.isCollecting = false;

        httpServer.listen(port, () => {
            console.log(`Dashboard server listening on port ${port}`);
        });

        this.setupSocketHandlers();
    }

    private setupSocketHandlers(): void {
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            this.connectedClients.add(socket.id);

            // Send historical data to new clients
            this.sendHistoricalData(socket);

            socket.on('requestMetrics', () => {
                this.sendHistoricalData(socket);
            });

            socket.on('disconnect', () => {
                console.log(`Client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket.id);
            });

            socket.on('error', (error) => {
                console.error(`Socket error for client ${socket.id}:`, error);
            });
        });
    }

    private sendHistoricalData(socket: any): void {
        const metrics = this.getBufferedMetrics();
        socket.emit('historicalMetrics', metrics);
    }

    private getBufferedMetrics(): DashboardMetrics[] {
        return this.metricsBuffer.metrics.filter(Boolean);
    }

    public startMetricsCollection(interval: number = 1000): void {
        if (this.isCollecting) return;

        this.isCollecting = true;
        this.collectInterval = setInterval(() => {
            this.collectAndBroadcastMetrics();
        }, interval);
    }

    public stopMetricsCollection(): void {
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.isCollecting = false;
        }
    }

    private collectAndBroadcastMetrics(): void {
        try {
            const metrics: DashboardMetrics = {
                timestamp: Date.now(),
                episodeReward: this.getCurrentEpisodeReward(),
                loss: this.getCurrentLoss(),
                epsilon: this.getCurrentEpsilon(),
                coverage: this.getCurrentCoverage(),
                memoryUsage: process.memoryUsage().heapUsed,
                uniqueCrashes: this.getUniqueCrashes()
            };

            this.addMetricsToBuffer(metrics);
            this.broadcastMetrics(metrics);
        } catch (error) {
            console.error('Error collecting metrics:', error);
        }
    }

    private addMetricsToBuffer(metrics: DashboardMetrics): void {
        this.metricsBuffer.metrics[this.metricsBuffer.currentIndex] = metrics;
        this.metricsBuffer.currentIndex = 
            (this.metricsBuffer.currentIndex + 1) % this.metricsBuffer.maxSize;
    }

    private broadcastMetrics(metrics: DashboardMetrics): void {
        this.io.emit('metrics', metrics);
    }

    // Placeholder methods for metric collection - to be implemented based on RL model
    private getCurrentEpisodeReward(): number {
        // TODO: Implement actual metric collection from RL model
        return 0;
    }

    private getCurrentLoss(): number {
        // TODO: Implement actual metric collection from RL model
        return 0;
    }

    private getCurrentEpsilon(): number {
        // TODO: Implement actual metric collection from RL model
        return 0;
    }

    private getCurrentCoverage(): number {
        // TODO: Implement actual metric collection from RL model
        return 0;
    }

    private getUniqueCrashes(): number {
        // TODO: Implement actual metric collection from RL model
        return 0;
    }

    public shutdown(): void {
        this.stopMetricsCollection();
        this.io.close();
    }
}

