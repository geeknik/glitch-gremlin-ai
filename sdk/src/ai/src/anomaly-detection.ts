import * as tf from '@tensorflow/tfjs-node';
import { tidy } from '@tensorflow/tfjs-core';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Export types and interfaces
export type MetricKey = 'instructionFrequency' | 'executionTime' | 'memoryUsage' | 'cpuUtilization' |
                    'errorRate' | 'pdaValidation' | 'accountDataMatching' | 'cpiSafety' | 'authorityChecks';

export interface TimeSeriesMetric {
    timestamp: number;
    metrics: {
        [K in MetricKey]?: number[];
    };
    metadata?: {
        [key: string]: unknown;
    };
}

interface MeanStd {
    mean: number[];
    std: number[];
}

interface Thresholds {
    reconstruction?: number;
    [key: string]: number | undefined;
}

export interface ModelConfig {
    inputSize: number;
    featureSize: number;
    timeSteps: number;
    encoderLayers: number[];
    decoderLayers: number[];
    lstmUnits: number;
    dropoutRate: number;
    batchSize: number;
    epochs: number;
    learningRate: number;
    validationSplit: number;
    anomalyThreshold: number;
    sensitivityLevel: number;
    adaptiveThresholding: boolean;
    featureEngineering: {
        enableTrending: boolean;
        enableSeasonality: boolean;
        enableCrossCorrelation: boolean;
        windowSize: number;
    };
    enableGPU: boolean;
    tensorflowMemoryOptimization: boolean;
    cacheSize: number;
}

export interface AnomalyResult {
    isAnomaly: boolean;
    confidence: number;
    details: AnomalyDetails;
    insights: AnomalyInsights;
    metrics: PerformanceMetrics;
}

export interface AnomalyDetails {
    anomalousMetrics: string[];
    contributingFactors: {
        metric: string;
        importance: number;
        threshold: number;
        currentValue: number;
    }[];
    patterns: {
        type: string;
        confidence: number;
        description: string;
    }[];
}

export interface AnomalyInsights {
    rootCause: {
        probability: number;
        factors: string[];
        evidence: string[];
    };
    recommendations: {
        priority: 'high' | 'medium' | 'low';
        action: string;
        impact: string;
    }[];
    historicalContext: {
        similarIncidents: number;
        frequency: string;
        lastOccurrence: Date | null;
    };
}

export interface PerformanceMetrics {
    processingTime: number;
    memoryUsage: number;
    modelAccuracy: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
}

export interface AnomalyDetailsItem {
type: string;
score: number;
threshold: number;
correlatedPatterns?: string[];
}

export class FeatureExtractor {
    constructor(private config: ModelConfig['featureEngineering']) {}

    public extractFeatures(data: TimeSeriesMetric[]): tf.Tensor2D {
        try {
            return tidy(() => {
                // Convert raw data to tensor format
                const features = data.map(metric => {
                    const values = Object.values(metric.metrics).flat();
                    return values;
                });
                return tf.tensor2d(features);
            });
        } catch (error) {
            console.error('Error extracting features:', error);
            throw new Error('Failed to extract features: ' + error.message);
        }
    }
}

export class StatisticalAnalyzer {
    public analyze(data: TimeSeriesMetric[]): { mean: number; std: number; } {
        const values = data.flatMap(metric =>
            Object.values(metric.metrics).flat()
        );
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        return {
            mean,
            std: Math.sqrt(variance)
        };
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
        private readonly models = {
            autoencoder: null as unknown as tf.LayersModel,
            lstm: null as unknown as tf.LayersModel
        };
        private featureExtractor: FeatureExtractor;
        private statisticalAnalyzer: StatisticalAnalyzer;
        private performanceMonitor: PerformanceMonitor;
        private meanStd: MeanStd = { mean: [], std: [] };
        private thresholds: Thresholds = {};
        private isInitialized = false;
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
        private config: ModelConfig;

        constructor(config: ModelConfig) {
            super();

            // Merge default config with provided config
            this.config = {
                ...{
                    inputSize: 40,
                    featureSize: 32,
                    timeSteps: 100,
                    encoderLayers: [64, 32],
                    decoderLayers: [32, 64],
                    lstmUnits: 128,
                    dropoutRate: 0.2,
                    batchSize: 32,
                    epochs: 100,
                    learningRate: 0.001,
                    validationSplit: 0.2,
                    anomalyThreshold: 0.95,
                    sensitivityLevel: 0.8,
                    adaptiveThresholding: true,
                    featureEngineering: {
                        enableTrending: true,
                        enableSeasonality: true,
                        enableCrossCorrelation: true,
                        windowSize: 50,
                    },
                    enableGPU: true,
                    tensorflowMemoryOptimization: true,
                    cacheSize: 1000,
                },
                ...config
            } as ModelConfig;

            // Initialize dependencies
            this.featureExtractor = new FeatureExtractor(this.config.featureEngineering);
            this.statisticalAnalyzer = new StatisticalAnalyzer();
            this.performanceMonitor = new PerformanceMonitor();

            this.validateConfig();
            this.initializeComponents();
        }

    private validateConfig(): void {
        if (this.config.inputSize <= 0) {
            throw new Error('Input size must be a positive number');
        }
        if (this.config.epochs <= 0) {
            throw new Error('Epochs must be a positive number');
        }
        if (this.config.anomalyThreshold < 0 || this.config.anomalyThreshold > 1) {
            throw new Error('Anomaly threshold must be between 0 and 1');
        }
    }

private initializeComponents(): void {
    this.featureExtractor = new FeatureExtractor(this.config.featureEngineering);
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.performanceMonitor = new PerformanceMonitor();
    this.buildModels();
    this.isInitialized = true;
}

private buildModels(): void {
    try {
        const modelBuilder = () => {
            // Build autoencoder model
            const autoencoder = this.buildAutoencoder();
            autoencoder.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            this.models.autoencoder = autoencoder;

            // Build LSTM model
            const lstm = this.buildLSTM();
            lstm.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            this.models.lstm = lstm;
        };
        
        // Use imported tidy function
        tidy(modelBuilder);
    } catch (error) {
        console.error('Error building models:', error);
        throw new Error('Failed to initialize TensorFlow models: ' + error.message);
    }
}
    private buildLSTM(): tf.LayersModel {
        const model = tf.sequential();
        model.add(tf.layers.lstm({
            units: this.config.lstmUnits,
            inputShape: [this.config.timeSteps, this.config.featureSize],
            returnSequences: true
        }));
        model.add(tf.layers.dropout({ rate: this.config.dropoutRate }));
        model.add(tf.layers.dense({ units: this.config.featureSize }));
        return model;
    }
    private buildAutoencoder(): tf.LayersModel {
        const model = tf.sequential();

        // Encoder layers
        for (let i = 0; i < this.config.encoderLayers.length; i++) {
            model.add(tf.layers.dense({
                units: this.config.encoderLayers[i],
                activation: 'relu'
            }));
        }

        // Decoder layers
        for (let i = this.config.decoderLayers.length - 1; i >= 0; i--) {
            model.add(tf.layers.dense({
                units: this.config.decoderLayers[i],
                activation: i === 0 ? 'sigmoid' : 'relu'
            }));
        }

        return model;
    }
    private preprocessMetrics(metrics: TimeSeriesMetric[]): tf.Tensor2D {
        try {
            return tidy((): tf.Tensor2D => {
                const flattenedData = metrics.map(metric => {
                    const allValues = [];
                    for (const key of this.metrics) {
                        if (metric.metrics[key]) {
                            allValues.push(...metric.metrics[key]);
                        } else {
                            allValues.push(0); // Default value if metric is missing
                        }
                    }
                    return allValues;
                });

        const tensorData = tf.tensor2d(flattenedData);

        if (!this.meanStd) {
            const moments = tf.moments(tensorData, 0);
            this.meanStd = {
                mean: Array.from(moments.mean.dataSync()),
                std: Array.from(tf.sqrt(moments.variance).dataSync())
            };
            tf.dispose([moments.mean, moments.variance]);
        }

        const normalizedData = tensorData.sub(tf.tensor2d([this.meanStd.mean]))
            .div(tf.tensor2d([this.meanStd.std]));

        return normalizedData as tf.Tensor2D; // Explicit cast
    });
    public async train(metrics: TimeSeriesMetric[]): Promise<void> {
        this.validateTrainingData(metrics);

        if (!this.isInitialized) {
            await this.buildModels();
            this.isInitialized = true;
        }

        const tensorData = this.preprocessMetrics(metrics);

        const trainCallback = {
            onEpochEnd: (epoch: number, logs?: tf.Logs) => {
                this.emit('trainingProgress', {
                    epoch,
                    totalEpochs: this.config.epochs,
                    loss: logs?.loss?.toFixed(4)
                });
            }
        };

    try {
        await this.models.autoencoder.fit(tensorData, tensorData, {
            epochs: this.config.epochs,
            batchSize: this.config.batchSize,
            validationSplit: this.config.validationSplit,
            callbacks: trainCallback
        });

        await this.models.lstm.fit(tensorData, tensorData, {
            epochs: this.config.epochs,
            batchSize: this.config.batchSize,
            validationSplit: this.config.validationSplit,
            callbacks: trainCallback
        });

        // Calculate reconstruction error thresholds
        const predictions = this.models.autoencoder.predict(tensorData) as tf.Tensor;
        const reconstructionErrors = tf.sub(tensorData, predictions).abs().mean(1);
        const errorsArray = reconstructionErrors.arraySync() as number[];
        const sorted = errorsArray.sort((a: number, b: number) => a - b);
        const index = Math.floor(sorted.length * this.config.anomalyThreshold);
        const threshold = sorted[index]; // Manual quantile calculation

        this.thresholds = {
            reconstruction: threshold
        };
    } catch (error) {
        this.emit('trainingError', error);
        throw error;
    }
    private validateTrainingData(metrics: TimeSeriesMetric[]): void {
        if (!metrics || metrics.length < 10) {
            throw new Error('Insufficient training data: At least 10 data points required');
        }

        for (const metric of metrics) {
            if (!metric.metrics || Object.keys(metric.metrics).length === 0) {
                throw new Error('No valid metrics found for training');
            }
        }
    }
    private analyzeAnomalyDetails(metrics: TimeSeriesMetric[], error: number): string[] {
        const details: string[] = [];
        const errorThreshold = this.config.anomalyThreshold;

        this.metrics.forEach((metric: MetricKey) => {
            const metricValues = metrics
                .map(m => m.metrics[metric])
                .filter((v): v is number[] => !!v)
                .map(arr => arr.reduce((a, b) => a + b, 0) / arr.length);

            if (metricValues.length > 0) {
                const meanValue = this.calculateMean(metricValues.flat());
                const variance = this.calculateVariance(metricValues.flat());

                if (variance > errorThreshold) {
                    details.push(`High variance in ${metric}: possible anomaly source`);
                }
            }
        });
        return details;
    }
    private calculateMean(values: number[]): number {
return values.reduce((a, b) => a + b, 0) / values.length;
    private calculateVariance(values: number[]): number {
const mean = this.calculateMean(values);
const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
return this.calculateMean(squaredDiffs);
}

    public async detect(metrics: TimeSeriesMetric[]): Promise<AnomalyResult> {
        this.performanceMonitor.start();

        if (!this.isInitialized) {
            throw new Error('Model not trained');
        }
        const tensorData = this.preprocessMetrics(metrics);
        const predictions = this.models.autoencoder.predict(tensorData) as tf.Tensor;
        const reconstructionErrors = tf.sub(predictions, tensorData).abs().mean(1);

        const anomalyScores = reconstructionErrors.div(tf.scalar(this.config.anomalyThreshold));
        const isAnomaly = anomalyScores.greater(tf.scalar(1));

        const details: AnomalyDetailsItem[] = [];
        for (let i = 0; i < this.metrics.length; i++) {
            const metricScore = anomalyScores.slice([0, i * 4], [-1, 4]).mean();
            const score = metricScore.dataSync()[0];

            if (score > 0.8) {
                details.push({
                    type: this.metrics[i],
                    score,
                    threshold: this.config.anomalyThreshold,
                    correlatedPatterns: this.findCorrelatedPatterns(this.metrics[i], metrics)
                });
            }
        }

        const anomalyDetails: AnomalyDetails = {
            anomalousMetrics: details.map(d => d.type),
            contributingFactors: details.map(d => ({
                metric: d.type,
                importance: d.score,
                threshold: d.threshold,
                currentValue: d.score
            })),
            patterns: details.map(d => ({
                type: d.type,
                confidence: d.score,
                description: `Anomaly detected in ${d.type}`
            }))
        };

        return {
            isAnomaly: isAnomaly.any().dataSync()[0] === 1,
            confidence: anomalyScores.mean().dataSync()[0],
            details: anomalyDetails,
            insights: {
                rootCause: {
                    probability: anomalyScores.mean().dataSync()[0],
                    factors: details.map(d => d.type),
                    evidence: details.map(d => `${d.type}: ${d.score}`)
                },
                recommendations: [{
                    priority: 'high',
                    action: 'Investigate anomalous metrics',
                    impact: 'System stability may be affected'
                }],
                historicalContext: {
                    similarIncidents: 0,
                    frequency: 'first occurrence',
                    lastOccurrence: null
                }
            },
            metrics: this.performanceMonitor.end()
        };
    }

    public async cleanup(): Promise<void> {
        if (this.models) {
            if (this.models.autoencoder) {
                this.models.autoencoder.dispose();
            }
            if (this.models.lstm) {
                this.models.lstm.dispose();
            }
        }
        tf.dispose(); // Clean up any remaining tensors
        this.meanStd = { mean: [], std: [] };
        this.thresholds = {};
        this.isInitialized = false;
    }

    private findCorrelatedPatterns(metricType: string, metrics: TimeSeriesMetric[]): string[] {
        const correlatedPatterns: string[] = [];

        this.metrics.forEach(metric => {
            if (metric !== metricType &&
                this.isMetricCorrelated(metrics, metricType as MetricKey, metric as MetricKey)) {
                correlatedPatterns.push(metric);
            }
        });

        return correlatedPatterns;
    }

private isMetricCorrelated(metrics: TimeSeriesMetric[], metric1: MetricKey, metric2: MetricKey): boolean {
    if (!metrics.length) {
        return false;
    }

    const values1 = metrics
        .map(m => m.metrics[metric1])
        .filter((v): v is number[] => !!v)
        .map(arr => arr.reduce((a, b) => a + b, 0) / arr.length);
    const values2 = metrics
        .map(m => m.metrics[metric2])
        .filter((v): v is number[] => !!v)
        .map(arr => arr.reduce((a, b) => a + b, 0) / arr.length);

    const correlation = this.calculateCorrelation(values1, values2);
    return Math.abs(correlation) > 0.7;
}

private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sum1 = x.reduce((a, b) => a + b, 0);
    const sum2 = y.reduce((a, b) => a + b, 0);
    const sum1Sq = x.reduce((a, b) => a + b * b, 0);
    const sum2Sq = y.reduce((a, b) => a + b * b, 0);
    const pSum = x.map((x, i) => x * y[i]).reduce((a, b) => a + b, 0);

const num = pSum - (sum1 * sum2 / n);
const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

return den === 0 ? 0 : num / den;
    public async save(modelPath: string): Promise<void> {
    if (!this.isInitialized) {
    throw new Error('Model not trained');
}

    if (!modelPath) {
    throw new Error('Invalid save path specified');
    }

    await fs.promises.mkdir(modelPath, { recursive: true });

    // Save model architecture and weights
    await Promise.all([
        this.models.autoencoder.save(`file://${modelPath}/autoencoder`),
        this.models.lstm.save(`file://${modelPath}/lstm`)
    ])

    // Save normalization parameters and thresholds
    await fs.promises.writeFile(
    path.join(modelPath, 'metadata.json'),
    JSON.stringify({
        meanStd: this.meanStd,
        thresholds: this.thresholds,
        config: this.config
    })
    );
    public async load(modelPath: string): Promise<void> {
    if (!fs.existsSync(modelPath)) {
    throw new Error('Model file not found');
    }

    try {
    // Load model architecture and weights
    this.models.autoencoder = await tf.loadLayersModel(`file://${modelPath}/autoencoder/model.json`);
    this.models.lstm = await tf.loadLayersModel(`file://${modelPath}/lstm/model.json`);

    // Load metadata
    const metadata = JSON.parse(
        await fs.promises.readFile(path.join(modelPath, 'metadata.json'), 'utf8')
    );

    this.meanStd = metadata.meanStd;
    this.thresholds = metadata.thresholds;
    Object.assign(this.config, metadata.config); // Update config properties

    this.isInitialized = true;
    } catch (error) {
    throw new Error('Invalid model format');
    }
    public async detectAnomalies(metrics: TimeSeriesMetric[]): Promise<AnomalyResult> {
    return this.detect(metrics);
    public getConfig(): ModelConfig {
    return this.config;
}
}
