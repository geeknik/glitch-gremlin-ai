import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';
import { TimeSeriesMetric, MetricType } from '@/types.js';
import { SecurityMetricsCollector, MetricsCollectorConfig } from './security-metrics-collector.js';
import { MetricsError } from './errors.js';

// Types and Interfaces
export interface FuzzingState {
coverage: number;
execTime: number;
crashCount: number;
uniquePaths: Set<string>;
lastMutation: string;
iterations: number;
}

export interface RewardConfig {
coverageWeight: number;
timeWeight: number;
crashWeight: number;
uniquePathWeight: number;
}

export interface VisualizationConfig {
logDir: string;
updateFrequency: number;
metrics: string[];
}

export interface FuzzingMetrics {
    episodeReward: number;
    episodeLength: number;
    explorationRate: number;
    uniquePathsFound: number;
    vulnerabilitiesFound: number;
    codeCoverage: number;
    avgExecutionTime: number;
    successRate: number;
    crashCount: number;
    timestamp: number;
}

export interface FuzzingMetricsConfig extends MetricsCollectorConfig {
    maxEpisodes?: number;
    convergenceThreshold?: number;
    minEpisodesForConvergence?: number;
    rewardWindowSize?: number;
}

// Custom Reward Functions
export class RewardFunctions {
private config: RewardConfig;

constructor(config: RewardConfig) {
    this.config = config;
}

public coverageBasedReward(state: FuzzingState): number {
    return state.coverage * this.config.coverageWeight;
}

public timeBasedReward(state: FuzzingState): number {
    return Math.exp(-state.execTime * this.config.timeWeight);
}

public crashBasedReward(state: FuzzingState): number {
    return state.crashCount * this.config.crashWeight;
}

public uniquePathReward(state: FuzzingState): number {
    return state.uniquePaths.size * this.config.uniquePathWeight;
}

public computeTotalReward(state: FuzzingState): number {
    return this.coverageBasedReward(state) +
        this.timeBasedReward(state) +
        this.crashBasedReward(state) +
        this.uniquePathReward(state);
}
}

// State Feature Extractors
export class StateFeatureExtractor {
public static extractFeatures(state: FuzzingState): tf.Tensor {
    const features = [
    state.coverage,
    state.execTime,
    state.crashCount,
    state.uniquePaths.size,
    state.iterations,
    this.encodeMutation(state.lastMutation)
    ];
    return tf.tensor(features);
}

private static encodeMutation(mutation: string): number {
    // Implement mutation encoding logic
    const mutationTypes = ['bitflip', 'byteflip', 'arithmetic', 'havoc'];
    return mutationTypes.indexOf(mutation) / mutationTypes.length;
}
}

// Visualization Utilities
export class VisualizationUtils {
private writer: any; // TODO: Replace with proper type once TF types are fixed
private config: VisualizationConfig;

constructor(config: VisualizationConfig) {
    this.config = config;
    this.writer = tf.node.summaryFileWriter(config.logDir);
}

public logMetrics(metrics: Record<string, number>, step: number): void {
    for (const [metric, value] of Object.entries(metrics)) {
    this.writer.scalar(metric, value, step);
    }
}

public logHistogram(name: string, values: number[], step: number): void {
    this.writer.histogram(name, values, step);
}

public dispose(): void {
    this.writer.flush();
    this.writer.close();
}
}

// Mutation Operators
export class SmartMutationOperator {
public static bitFlip(input: Buffer, position: number): Buffer {
    const result = Buffer.from(input);
    result[position] ^= 0xFF;
    return result;
}

public static arithmetic(input: Buffer, position: number): Buffer {
    const result = Buffer.from(input);
    result[position] = (result[position] + 1) % 256;
    return result;
}

public static havoc(input: Buffer, mutations: number): Buffer {
    let result = Buffer.from(input);
    for (let i = 0; i < mutations; i++) {
    const position = Math.floor(Math.random() * result.length);
    const operation = Math.floor(Math.random() * 3);
    switch (operation) {
        case 0:
        result = Buffer.from(this.bitFlip(result, position));
        break;
        case 1:
        result = Buffer.from(this.arithmetic(result, position));
        break;
        case 2:
        // Add more complex mutations here
        break;
    }
    }
    return result;
}
}

// Performance Monitoring
export class PerformanceMonitor {
private metrics: Map<string, number[]>;
private startTime: number;

constructor() {
    this.metrics = new Map();
    this.startTime = Date.now();
}

public recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
    this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
}

public getStats(metricName: string): {
    mean: number;
    std: number;
    min: number;
    max: number;
} {
    const values = this.metrics.get(metricName) || [];
    if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0 };
    }

    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    
    return {
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values)
    };
}

public getElapsedTime(): number {
    return (Date.now() - this.startTime) / 1000;
}

public reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
}
}

export class FuzzingMetricsCollector extends SecurityMetricsCollector {
    private episodeMetrics: FuzzingMetrics[] = [];
    private readonly maxEpisodes: number;
    private readonly convergenceThreshold: number;
    private readonly minEpisodesForConvergence: number;
    private readonly rewardWindowSize: number;
    protected isCollecting: boolean = false;

    constructor(config: FuzzingMetricsConfig) {
        super(config);
        this.maxEpisodes = config.maxEpisodes || 1000;
        this.convergenceThreshold = config.convergenceThreshold || 0.05;
        this.minEpisodesForConvergence = config.minEpisodesForConvergence || 500;
        this.rewardWindowSize = config.rewardWindowSize || 100;
    }

    public async startCollection(): Promise<void> {
        if (this.isCollecting) {
            throw new MetricsError('Metrics collection already started', 'ALREADY_STARTED');
        }
        this.isCollecting = true;
        await super.startCollection();
    }

    public async stopCollection(): Promise<void> {
        if (!this.isCollecting) {
            throw new MetricsError('Metrics collection not started', 'NOT_STARTED');
        }
        this.isCollecting = false;
        await super.stopCollection();
    }

    protected override async gatherCurrentMetrics(): Promise<TimeSeriesMetric[]> {
        if (!this.isCollecting) {
            return [];
        }

        try {
            const baseMetrics = await super.gatherCurrentMetrics();
            const fuzzingMetrics = this.getFuzzingMetrics();
            return [...baseMetrics, ...fuzzingMetrics];
        } catch (error) {
            throw new MetricsError('Failed to gather metrics', 'GATHER_ERROR');
        }
    }

    private getFuzzingMetrics(): TimeSeriesMetric[] {
        const currentTime = Date.now();
        const metrics: TimeSeriesMetric[] = [
            {
                type: MetricType.EPISODE_REWARD,
                name: 'Episode Reward',
                value: this.getAverageReward(),
                timestamp: currentTime,
                source: 'fuzzing',
                severity: 'info',
                metadata: {
                    standardDeviation: this.calculateRewardStdDev()
                }
            },
            {
                type: MetricType.CODE_COVERAGE,
                name: 'Code Coverage',
                value: this.calculateAverageCoverage(),
                timestamp: currentTime,
                source: 'fuzzing',
                severity: 'info',
                metadata: {
                    standardDeviation: this.calculateCoverageStdDev()
                }
            },
            {
                type: MetricType.SUCCESS_RATE,
                name: 'Success Rate',
                value: this.calculateAverageSuccessRate(),
                timestamp: currentTime,
                source: 'fuzzing',
                severity: 'info',
                metadata: {
                    standardDeviation: this.calculateSuccessRateStdDev()
                }
            },
            {
                type: MetricType.EXECUTION_TIME,
                name: 'Execution Time',
                value: this.calculateAverageExecutionTime(),
                timestamp: currentTime,
                source: 'fuzzing',
                severity: 'info',
                metadata: {
                    standardDeviation: this.calculateExecutionTimeStdDev()
                }
            },
            {
                type: MetricType.UNIQUE_PATHS,
                name: 'Unique Paths',
                value: this.calculateAverageUniquePaths(),
                timestamp: currentTime,
                source: 'fuzzing',
                severity: 'info'
            },
            {
                type: MetricType.VULNERABILITIES,
                name: 'Vulnerabilities Found',
                value: this.calculateAverageVulnerabilities(),
                timestamp: currentTime,
                source: 'fuzzing',
                severity: 'info'
            }
        ];

        return metrics;
    }

    private calculateRewardStdDev(): number {
        return this.calculateStandardDeviation(
            this.episodeMetrics.map(m => m.episodeReward)
        );
    }

    private calculateCoverageStdDev(): number {
        return this.calculateStandardDeviation(
            this.episodeMetrics.map(m => m.codeCoverage)
        );
    }

    private calculateSuccessRateStdDev(): number {
        return this.calculateStandardDeviation(
            this.episodeMetrics.map(m => m.successRate)
        );
    }

    private calculateExecutionTimeStdDev(): number {
        return this.calculateStandardDeviation(
            this.episodeMetrics.map(m => m.avgExecutionTime)
        );
    }

    private calculateStandardDeviation(values: number[]): number {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((a, b) => a + b) / values.length;
        const squareDiffs = values.map(value => {
            const diff = value - mean;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    private calculateAverageCoverage(): number {
        return this.calculateAverage(this.episodeMetrics.map(m => m.codeCoverage));
    }

    private calculateAverageUniquePaths(): number {
        return this.calculateAverage(this.episodeMetrics.map(m => m.uniquePathsFound));
    }

    private calculateAverageVulnerabilities(): number {
        return this.calculateAverage(this.episodeMetrics.map(m => m.vulnerabilitiesFound));
    }

    private calculateAverageSuccessRate(): number {
        return this.calculateAverage(this.episodeMetrics.map(m => m.successRate));
    }

    private calculateAverageExecutionTime(): number {
        return this.calculateAverage(this.episodeMetrics.map(m => m.avgExecutionTime));
    }

    private calculateAverage(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b) / values.length;
    }

    public recordEpisodeMetrics(metrics: FuzzingMetrics): void {
        // Convert Date to number if needed
        const metricsWithTimestamp = {
            ...metrics,
            timestamp: typeof metrics.timestamp === 'number' ? metrics.timestamp : Date.now()
        };
        this.episodeMetrics.push(metricsWithTimestamp);
    }

    public getAverageReward(lastN?: number): number {
        const n = lastN || this.rewardWindowSize;
        const recentEpisodes = this.episodeMetrics.slice(-n);
        if (recentEpisodes.length === 0) return 0;
        
        const sum = recentEpisodes.reduce((acc, m) => acc + m.episodeReward, 0);
        return sum / recentEpisodes.length;
    }

    public getSuccessRate(lastN?: number): number {
        const n = lastN || this.rewardWindowSize;
        const recentEpisodes = this.episodeMetrics.slice(-n);
        if (recentEpisodes.length === 0) return 0;
        
        const successfulEpisodes = recentEpisodes.filter(m => m.successRate > 0.5).length;
        return successfulEpisodes / recentEpisodes.length;
    }

    public getProgressMetrics(): {
        avgReward: number;
        successRate: number;
        codeCoverage: number;
        uniquePaths: number;
        vulnerabilities: number;
    } {
        const lastEpisode = this.episodeMetrics[this.episodeMetrics.length - 1] || {
            episodeReward: 0,
            successRate: 0,
            codeCoverage: 0,
            uniquePathsFound: 0,
            vulnerabilitiesFound: 0
        };

        return {
            avgReward: this.getAverageReward(),
            successRate: this.getSuccessRate(),
            codeCoverage: lastEpisode.codeCoverage,
            uniquePaths: lastEpisode.uniquePathsFound,
            vulnerabilities: lastEpisode.vulnerabilitiesFound
        };
    }

    public getConvergenceStatus(): {
        hasConverged: boolean;
        convergenceEpisode?: number;
        stabilityScore: number;
    } {
        if (this.episodeMetrics.length < this.minEpisodesForConvergence) {
            return {
                hasConverged: false,
                stabilityScore: 0
            };
        }

        // Calculate moving averages
        const movingAverages: number[] = [];
        for (let i = this.rewardWindowSize; i < this.episodeMetrics.length; i++) {
            const windowRewards = this.episodeMetrics
                .slice(i - this.rewardWindowSize, i)
                .map(m => m.episodeReward);
            const avg = windowRewards.reduce((a, b) => a + b, 0) / this.rewardWindowSize;
            movingAverages.push(avg);
        }

        // Check for convergence
        let convergenceEpisode: number | undefined;
        for (let i = 1; i < movingAverages.length; i++) {
            const relativeChange = Math.abs(
                (movingAverages[i] - movingAverages[i - 1]) / movingAverages[i - 1]
            );
            
            if (relativeChange < this.convergenceThreshold) {
                convergenceEpisode = i + this.rewardWindowSize;
                break;
            }
        }

        // Calculate stability score
        const recentAvg = movingAverages[movingAverages.length - 1] || 0;
        const variations = movingAverages.map(avg => Math.abs(avg - recentAvg));
        const stabilityScore = 1 - (Math.max(...variations) / recentAvg);

        return {
            hasConverged: convergenceEpisode !== undefined,
            convergenceEpisode,
            stabilityScore
        };
    }

    public override async generateGraphs(metricType: MetricType, rrdPath: string): Promise<void> {
        await super.generateGraphs(metricType, rrdPath);

        // Add additional fuzzing-specific visualizations
        if (this.episodeMetrics.length > 0) {
            const convergenceStatus = this.getConvergenceStatus();
            const progressMetrics = this.getProgressMetrics();

            // Add performance indicators to the dashboard HTML
            const metricsMap = new Map<MetricType, TimeSeriesMetric[]>([
                [metricType, this.timeSeriesAnalysis.getMetrics(metricType)]
            ]);

            // Update dashboard
            await this.visualization.createDashboard(
                metricsMap,
                this.config.outputDir
            );
        }
    }
}

class TimeSeriesMetricsCollector {
    private collectMetric(value: number, type: MetricType): TimeSeriesMetric {
        return {
            type,
            name: type.toString(),
            value,
            timestamp: Date.now(),
            source: 'fuzzing',
            severity: 'info',
            metadata: {}
        };
    }
}

