import * as tf from '@tensorflow/tfjs-node';
import { TimeSeriesAnalysis } from './time-series-analysis.js';
import { MetricVisualization } from './metric-visualization.js';
import { MetricType, TimeSeriesMetric } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

export interface MetricsCollectorConfig {
    outputDir: string;
    rrdPath: string;
    updateInterval: number; // in milliseconds
    retentionPeriods: {
        realtime: string;  // e.g., "1m:24h" - 1 minute resolution for 24 hours
        hourly: string;    // e.g., "1h:7d" - 1 hour resolution for 7 days
        daily: string;     // e.g., "1d:30d" - 1 day resolution for 30 days
        monthly: string;   // e.g., "30d:1y" - 30 days resolution for 1 year
    };
    graphOptions: {
        width: number;
        height: number;
        colors: {
            background: string;
            grid: string;
            text: string;
            line: string[];
        };
    };
}

export class SecurityMetricsCollector {
    protected readonly config: MetricsCollectorConfig;
    protected readonly timeSeriesAnalysis: TimeSeriesAnalysis;
    protected readonly visualization: MetricVisualization;
    protected readonly rrdDatabases: Map<string, string> = new Map();
    protected isCollecting: boolean = false;
    protected collectionInterval: NodeJS.Timer | null = null;

    constructor(config: MetricsCollectorConfig) {
        this.config = config;
        this.timeSeriesAnalysis = new TimeSeriesAnalysis();
        this.visualization = new MetricVisualization(config.graphOptions);
        this.initializeDirectories();
    }

    protected async initializeDirectories(): Promise<void> {
        // Create output directory if it doesn't exist
        await fs.mkdir(this.config.outputDir, { recursive: true });
        await fs.mkdir(this.config.rrdPath, { recursive: true });

        // Create RRD databases for each metric type if they don't exist
        for (const metricType of Object.values(MetricType)) {
            const rrdPath = path.join(this.config.rrdPath, `${metricType}.rrd`);
            if (!await this.fileExists(rrdPath)) {
                await this.createRRDDatabase(metricType, rrdPath);
            }
            this.rrdDatabases.set(metricType, rrdPath);
        }
    }

    protected async fileExists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    protected async createRRDDatabase(metricType: MetricType, rrdPath: string): Promise<void> {
        const { realtime, hourly, daily, monthly } = this.config.retentionPeriods;
        
        // Create RRD database with multiple retention periods
        const args = [
            'create', rrdPath,
            '--step', '60',  // 1-minute base interval
            `DS:${metricType}:GAUGE:120:U:U`,  // Data source definition
            `RRA:AVERAGE:0.5:1:${this.parseRetentionHours(realtime)}`,    // Realtime data
            `RRA:AVERAGE:0.5:60:${this.parseRetentionHours(hourly)}`,     // Hourly data
            `RRA:AVERAGE:0.5:1440:${this.parseRetentionHours(daily)}`,    // Daily data
            `RRA:AVERAGE:0.5:43200:${this.parseRetentionHours(monthly)}`, // Monthly data
            'RRA:MIN:0.5:1:1440',  // Daily min values
            'RRA:MAX:0.5:1:1440',  // Daily max values
            'RRA:LAST:0.5:1:1440'  // Last values
        ];

        await this.executeRRDTool('create', args);
    }

    protected parseRetentionHours(retention: string): number {
        const [interval, duration] = retention.split(':');
        const intervalHours = this.parseTimeToHours(interval);
        const durationHours = this.parseTimeToHours(duration);
        return Math.floor(durationHours / intervalHours);
    }

    protected parseTimeToHours(time: string): number {
        const value = parseInt(time.slice(0, -1));
        const unit = time.slice(-1);
        switch (unit) {
            case 'm': return value / 60;
            case 'h': return value;
            case 'd': return value * 24;
            case 'y': return value * 24 * 365;
            default: throw new Error(`Invalid time unit: ${unit}`);
        }
    }

    protected async executeRRDTool(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const rrdtool = spawn('rrdtool', [command, ...args]);
            let output = '';
            let error = '';

            rrdtool.stdout.on('data', (data) => {
                output += data.toString();
            });

            rrdtool.stderr.on('data', (data) => {
                error += data.toString();
            });

            rrdtool.on('close', (code) => {
                if (code === 0) {
                    resolve(output.trim());
                } else {
                    reject(new Error(`rrdtool failed with code ${code}: ${error}`));
                }
            });
        });
    }

    public async startCollection(): Promise<void> {
        if (this.isCollecting) {
            return;
        }

        this.isCollecting = true;
        this.collectionInterval = setInterval(
            async () => {
                try {
                    await this.collectMetrics();
                } catch (error) {
                    console.error('Error collecting metrics:', error);
                }
            },
            this.config.updateInterval
        ) as unknown as NodeJS.Timer;
    }

    public async stopCollection(): Promise<void> {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval as unknown as number);
            this.collectionInterval = null;
        }
        this.isCollecting = false;
    }

    protected async collectMetrics(): Promise<void> {
        const timestamp = Math.floor(Date.now() / 1000);
        const metrics = await this.gatherCurrentMetrics();

        for (const metric of metrics) {
            const rrdPath = this.rrdDatabases.get(metric.type);
            if (!rrdPath) continue;

            // Update RRD database
            await this.executeRRDTool('update', [
                rrdPath,
                `${timestamp}:${metric.value}`
            ]);

            // Generate graphs
            await this.generateGraphs(metric.type, rrdPath);
        }
    }

    protected async gatherCurrentMetrics(): Promise<TimeSeriesMetric[]> {
        const metrics: TimeSeriesMetric[] = [];
        const currentTime = Date.now();

        // Collect CPU utilization
        metrics.push({
            type: MetricType.CPU_UTILIZATION,
            name: 'CPU Utilization',
            value: await this.getCPUUtilization(),
            timestamp: currentTime,
            source: 'system',
            severity: 'info',
            metadata: {
                baseline: 50,
                standardDeviation: 10
            }
        });

        // Collect memory usage
        metrics.push({
            type: MetricType.MEMORY_USAGE,
            name: 'Memory Usage',
            value: await this.getMemoryUsage(),
            timestamp: currentTime,
            source: 'system',
            severity: 'info',
            metadata: {
                baseline: 60,
                standardDeviation: 15
            }
        });

        // Add more metric collection as needed
        return metrics;
    }

    protected async getCPUUtilization(): Promise<number> {
        // Implementation would depend on the platform
        // This is a placeholder that returns a random value
        return Math.random() * 100;
    }

    protected async getMemoryUsage(): Promise<number> {
        // Implementation would depend on the platform
        // This is a placeholder that returns a random value
        return Math.random() * 100;
    }

    protected async generateGraphs(metricType: MetricType, rrdPath: string): Promise<void> {
        const periods = [
            { name: 'hour', duration: '1h' },
            { name: '6hours', duration: '6h' },
            { name: 'day', duration: '1d' },
            { name: 'week', duration: '1w' },
            { name: 'month', duration: '1m' },
            { name: 'year', duration: '1y' }
        ];

        for (const period of periods) {
            const graphPath = path.join(
                this.config.outputDir,
                `${metricType}_${period.name}.png`
            );

            const endTime = Math.floor(Date.now() / 1000);
            const startTime = this.calculateStartTime(period.duration);

            await this.executeRRDTool('graph', [
                graphPath,
                '--start', startTime.toString(),
                '--end', endTime.toString(),
                '--width', this.config.graphOptions.width.toString(),
                '--height', this.config.graphOptions.height.toString(),
                '--title', `${metricType} - Last ${period.name}`,
                '--vertical-label', 'Value',
                '--color', `BACK${this.config.graphOptions.colors.background}`,
                '--color', `GRID${this.config.graphOptions.colors.grid}`,
                '--color', `FONT${this.config.graphOptions.colors.text}`,
                `DEF:data=${rrdPath}:${metricType}:AVERAGE`,
                `LINE1:data${this.config.graphOptions.colors.line[0]}:${metricType}`,
                'GPRINT:data:LAST:Current\\:%8.2lf %s',
                'GPRINT:data:AVERAGE:Average\\:%8.2lf %s',
                'GPRINT:data:MAX:Maximum\\:%8.2lf %s\\n'
            ]);
        }
    }

    protected calculateStartTime(duration: string): number {
        const now = Math.floor(Date.now() / 1000);
        const value = parseInt(duration.slice(0, -1));
        const unit = duration.slice(-1);

        switch (unit) {
            case 'h': return now - (value * 3600);
            case 'd': return now - (value * 86400);
            case 'w': return now - (value * 604800);
            case 'm': return now - (value * 2592000);
            case 'y': return now - (value * 31536000);
            default: throw new Error(`Invalid duration unit: ${unit}`);
        }
    }

    public async getMetricHistory(
        metricType: MetricType,
        startTime: Date,
        endTime: Date
    ): Promise<TimeSeriesMetric[]> {
        const rrdPath = this.rrdDatabases.get(metricType);
        if (!rrdPath) {
            throw new Error(`No RRD database found for metric type: ${metricType}`);
        }

        const start = Math.floor(startTime.getTime() / 1000);
        const end = Math.floor(endTime.getTime() / 1000);

        const data = await this.executeRRDTool('fetch', [
            rrdPath,
            'AVERAGE',
            '--start', start.toString(),
            '--end', end.toString()
        ]);

        return this.parseRRDOutput(data, metricType);
    }

    protected parseRRDOutput(output: string, metricType: MetricType): TimeSeriesMetric[] {
        const metrics: TimeSeriesMetric[] = [];
        const lines = output.trim().split('\n');

        for (const line of lines) {
            const [timestamp, value] = line.split(':');
            if (!timestamp || !value) continue;

            metrics.push({
                type: metricType,
                name: metricType.toString(),
                value: parseFloat(value),
                timestamp: parseInt(timestamp) * 1000, // Convert Unix timestamp to milliseconds
                source: 'rrd',
                severity: 'info',
                metadata: {
                    baseline: 0, // Could be calculated from historical data
                    standardDeviation: 0 // Could be calculated from historical data
                }
            });
        }

        return metrics;
    }

    public async cleanup(): Promise<void> {
        await this.stopCollection();
        // Additional cleanup if needed
    }
}

