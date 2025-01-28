import { EventEmitter } from 'events';
import * as tf from '@tensorflow/tfjs';
import type { Sequential } from '@tensorflow/tfjs-layers';
import type { Tensor } from '@tensorflow/tfjs-core';
import { Sequential as tfjsSequential, layers } from '@tensorflow/tfjs-node';

export interface TimeSeriesMetric {
    instructionFrequency: number[];
    executionTime: number[];
    memoryUsage: number[];
    cpuUtilization: number[];
    errorRate: number[];
    pdaValidation: number[];
    accountDataMatching: number[];
    cpiSafety: number[];
    authorityChecks: number[];
    timestamp: number;
    metadata?: {
        [key: string]: unknown;
    };
}

export type MetricKey = keyof Omit<TimeSeriesMetric, 'timestamp' | 'metadata'>;

export interface DetectorConfig {
    windowSize: number;
    zScoreThreshold: number;
    minSampleSize: number;
    anomalyThreshold: number;
    timeSteps: number;
    dropoutRate: number;
    hiddenLayers: number[];
    epochs: number;
    solanaWeights: {
        pdaValidation: number;
        accountDataMatching: number;
        cpiSafety: number;
        authorityChecks: number;
    };
}

export interface AnomalyResult {
    isAnomaly: boolean;
    anomalyScore: number;
    metrics: {
        metric: MetricKey;
        zScore: number;
        isAnomaly: boolean;
        threshold: number;
    }[];
    timestamp: number;
    metricWeights?: {
        pdaValidation: number;
        accountDataMatching: number;
        cpiSafety: number;
        authorityChecks: number;
    };
    zScores?: {
        pdaValidation: number;
        accountDataMatching: number;
        cpiSafety: number;
        authorityChecks: number;
    };
}

export interface StatisticalSummary {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
}

export interface MovingStats {
    mean: number;
    variance: number;
    count: number;
}

export interface ModelConfig {
    featureEngineering: {
        enableTrending: boolean;
        enableSeasonality: boolean;
        enableCrossCorrelation: boolean;
        windowSize: number;
    };
}

export interface PerformanceMetrics {
    processingTime: number;
    memoryUsage: number;
    modelAccuracy: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
}

export class FeatureExtractor {
    constructor(private config: ModelConfig['featureEngineering']) {}

    public extractFeatures(data: TimeSeriesMetric[]): tf.Tensor2D {
        try {
            return tf.tidy(() => {
                // Convert raw data to tensor format
                const features = data.map(metric => {
                    const values = [
                        ...metric.instructionFrequency,
                        ...metric.executionTime,
                        ...metric.memoryUsage,
                        ...(metric.cpuUtilization || []),
                        ...metric.errorRate,
                        ...metric.pdaValidation,
                        ...metric.accountDataMatching,
                        ...metric.cpiSafety,
                        ...metric.authorityChecks
                    ];
                    return values;
                });
                // Create tensor with shape [data.length, totalFeatures]
                return tf.tensor2d(features);
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error extracting features:', errorMessage);
            throw new Error('Failed to extract features: ' + errorMessage);
        }
    }
}

export class StatisticalAnalyzer {
    public analyze(data: TimeSeriesMetric[]): { mean: tf.Tensor; std: tf.Tensor; } {
        try {
            return tf.tidy(() => {
                const values = data.flatMap(metric => [
                    ...metric.instructionFrequency,
                    ...metric.executionTime,
                    ...metric.memoryUsage,
                    ...metric.cpuUtilization,
                    ...metric.errorRate,
                    ...metric.pdaValidation,
                    ...metric.accountDataMatching,
                    ...metric.cpiSafety,
                    ...metric.authorityChecks
                ]);

                const tensor = tf.tensor1d(values);
                const { mean, variance } = tf.moments(tensor);
                const std = tf.sqrt(variance);

                return { mean, std };
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error analyzing data:', errorMessage);
            throw new Error('Failed to analyze data: ' + errorMessage);
        }
    }
}

export class PerformanceMonitor {
    private startTime: number = 0;
    private memoryUsage: number = 0;

    public start(): void {
        this.startTime = Date.now();
        this.memoryUsage = process.memoryUsage().heapUsed;
    }

    public end(): PerformanceMetrics {
        return {
            processingTime: Date.now() - this.startTime,
            memoryUsage: process.memoryUsage().heapUsed - this.memoryUsage,
            modelAccuracy: 0,
            falsePositiveRate: 0,
            falseNegativeRate: 0
        };
    }
}

export class AnomalyDetector extends EventEmitter {
    private model: Sequential | null = null;
    private config: DetectorConfig;
    private isTrained: boolean = false;
    private readonly metrics: MetricKey[] = [
        'instructionFrequency',
        'executionTime',
        'memoryUsage',
        'cpuUtilization',
        'errorRate',
        'pdaValidation',
        'accountDataMatching',
        'cpiSafety',
        'authorityChecks'
    ];

    private constructor(config: DetectorConfig) {
        super();
        this.config = config;
    }

    public static async create(config: DetectorConfig): Promise<AnomalyDetector> {
        const detector = new AnomalyDetector(config);
        await detector.initializeModel();
        return detector;
    }

    private async initializeModel(): Promise<void> {
        const model = tf.sequential();
        
        // Input layer with Solana-specific feature weighting
        model.add(tf.layers.dense({
            units: this.config.hiddenLayers[0],
            activation: 'relu',
            inputShape: [this.metrics.length],
            kernelInitializer: tf.initializers.glorotNormal({
                seed: Math.floor(Date.now() / 1000)
            })
        }));

        // Add hidden layers
        for (const units of this.config.hiddenLayers.slice(1, -1)) {
            model.add(tf.layers.dense({
                units,
                activation: 'relu'
            }));
        }

        // Add dropout for regularization
        if (this.config.dropoutRate > 0) {
            model.add(tf.layers.dropout({ rate: this.config.dropoutRate }));
        }

        // Output layer
        model.add(tf.layers.dense({
            units: this.metrics.length,
            activation: 'sigmoid'
        }));

        model.compile({
            optimizer: 'adam',
            loss: 'meanSquaredError'
        });

        this.model = model;
    }

    public async train(data: TimeSeriesMetric[]): Promise<void> {
        if (!data || data.length === 0) {
            throw new Error('Training data cannot be empty');
        }

        if (!this.model) {
            throw new Error('Model not initialized');
        }

        const features = data.map(metric => [
            ...metric.instructionFrequency,
            ...metric.executionTime,
            ...metric.memoryUsage,
            ...metric.cpuUtilization,
            ...metric.errorRate,
            ...metric.pdaValidation,
            ...metric.accountDataMatching,
            ...metric.cpiSafety,
            ...metric.authorityChecks
        ].flat());

        const inputTensor = tf.tensor2d(features, [features.length, this.metrics.length]);
        
        try {
            // Train the model
            await this.model.fit(inputTensor, inputTensor, {
                epochs: this.config.epochs,
                shuffle: true,
                verbose: 0
            });
            this.isTrained = true;
        } finally {
            inputTensor.dispose();
        }
    }

    public async detect(metric: TimeSeriesMetric): Promise<AnomalyResult> {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained');
        }

        const input = [
            ...metric.instructionFrequency,
            ...metric.executionTime,
            ...metric.memoryUsage,
            ...metric.cpuUtilization,
            ...metric.errorRate,
            ...metric.pdaValidation,
            ...metric.accountDataMatching,
            ...metric.cpiSafety,
            ...metric.authorityChecks
        ].flat();

        const inputTensor = tf.tensor2d([input], [1, this.metrics.length]);
        
        try {
            // Get reconstruction
            const output = this.model.predict(inputTensor) as tf.Tensor;
            const reconstruction = output.dataSync();
            
            // Calculate reconstruction error
            const error = input.map((val, i) => Math.abs(val - reconstruction[i]));
            const anomalyScore = error.reduce((a, b) => a + b, 0) / error.length;
            
            // Calculate per-metric anomaly scores
            const metricScores = this.metrics.map((metric, i) => ({
                metric,
                zScore: error[i],
                isAnomaly: error[i] > this.config.zScoreThreshold,
                threshold: this.config.zScoreThreshold
            }));

            return {
                isAnomaly: anomalyScore > this.config.anomalyThreshold,
                anomalyScore,
                metrics: metricScores,
                timestamp: metric.timestamp,
                metricWeights: this.config.solanaWeights,
                zScores: {
                    pdaValidation: error[this.metrics.indexOf('pdaValidation')],
                    accountDataMatching: error[this.metrics.indexOf('accountDataMatching')],
                    cpiSafety: error[this.metrics.indexOf('cpiSafety')],
                    authorityChecks: error[this.metrics.indexOf('authorityChecks')]
                }
            };
        } finally {
            inputTensor.dispose();
            tf.engine().disposeVariables();
        }
    }

    public async cleanup(): Promise<void> {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        tf.engine().disposeVariables();
    }

    public getConfig(): DetectorConfig {
        return { ...this.config };
    }
}
