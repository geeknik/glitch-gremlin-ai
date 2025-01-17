import { EventEmitter } from 'events';

export type MetricKey = 'instructionFrequency' | 'executionTime' | 'memoryUsage' | 'cpuUtilization' |
                    'errorRate' | 'pdaValidation' | 'accountDataMatching' | 'cpiSafety' | 'authorityChecks';

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

export interface DetectorConfig {
    windowSize: number;
    zScoreThreshold: number;
    minSampleSize: number;
    sensitivityLevel: number;
    adaptiveThreshold?: boolean;
    seasonalityPeriod?: number;
}

export interface AnomalyResult {
    isAnomaly: boolean;
    score: number;
    metrics: {
        metric: MetricKey;
        zScore: number;
        isAnomaly: boolean;
        threshold: number;
    }[];
    timestamp: number;
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
                        ...metric.cpuUtilization,
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
    private config: DetectorConfig;
    private dataWindow: number[] = [];
    private mean: number = 0;
    private stdDev: number = 0;
    private readonly metrics: MetricKey[];

    private models: {
        autoencoder: any;
        lstm: any;
    } = {
        autoencoder: null,
        lstm: null
    };

    constructor(config?: Partial<DetectorConfig>) {
        super();
        this.config = {
            windowSize: 50,
            zScoreThreshold: 3,
            minSampleSize: 10,
            sensitivityLevel: 0.95,
            ...config
        };

        if (config?.inputSize !== undefined && config.inputSize <= 0) {
            throw new Error('Input size must be positive');
        }
        if (config?.anomalyThreshold !== undefined && 
            (config.anomalyThreshold <= 0 || config.anomalyThreshold > 1)) {
            throw new Error('Anomaly threshold must be between 0 and 1');
        }
        if (config?.timeSteps !== undefined && config.timeSteps <= 0) {
            throw new Error('Time steps must be positive');
        }
        if (config?.dropoutRate !== undefined && 
            (config.dropoutRate < 0 || config.dropoutRate > 1)) {
            throw new Error('Dropout rate must be between 0 and 1');
        }
        if (config?.encoderLayers !== undefined && config.encoderLayers.length === 0) {
            throw new Error('Encoder layers cannot be empty');
        }
        if (config?.decoderLayers !== undefined && config.decoderLayers.length === 0) {
            throw new Error('Decoder layers cannot be empty');
        }
        this.metrics = [
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

        this.validateConfig();
        this.initializeComponents();
    }

    private validateConfig(): void {
        if (this.config.windowSize <= 0) {
            throw new Error('Window size must be positive');
        }
        if (this.config.zScoreThreshold <= 0) {
            throw new Error('Z-score threshold must be positive');
        }
        if (this.config.minSampleSize <= 0) {
            throw new Error('Minimum sample size must be positive');
        }
        if (this.config.sensitivityLevel <= 0 || this.config.sensitivityLevel > 1) {
            throw new Error('Sensitivity level must be between 0 and 1');
        }
    }

    private initializeComponents(): void {
        // Initialize statistical components
        this.dataWindow = [];
        this.mean = 0;
        this.stdDev = 0;
        this.isInitialized = true;
    }

    private updateStatistics(value: number): void {
        this.dataWindow.push(value);
        if (this.dataWindow.length > this.config.windowSize) {
            this.dataWindow.shift();
        }

        if (this.dataWindow.length >= this.config.minSampleSize) {
            // Calculate mean
            this.mean = this.dataWindow.reduce((sum, val) => sum + val, 0) / this.dataWindow.length;
            
            // Calculate standard deviation
            const squaredDiffs = this.dataWindow.map(val => Math.pow(val - this.mean, 2));
            this.stdDev = Math.sqrt(squaredDiffs.reduce((sum, val) => sum + val, 0) / this.dataWindow.length);
        }
    }

    private calculateZScore(value: number): number {
        if (this.dataWindow.length < this.config.minSampleSize || this.stdDev === 0) {
            return 0;
        }
        return Math.abs((value - this.mean) / this.stdDev);
    }

    private detectAnomalies(data: number[]): AnomalyResult {
        const anomalies: {
            metric: MetricKey;
            zScore: number;
            isAnomaly: boolean;
            threshold: number;
        }[] = [];

        data.forEach((value, index) => {
            this.updateStatistics(value);
            const zScore = this.calculateZScore(value);
            const isAnomaly = zScore > this.config.zScoreThreshold;
            
            if (isAnomaly) {
                anomalies.push({
                    metric: this.metrics[index % this.metrics.length],
                    zScore,
                    isAnomaly,
                    threshold: this.config.zScoreThreshold
                });
            }
        });

        return {
            isAnomaly: anomalies.length > 0,
            score: Math.max(...anomalies.map(a => a.zScore), 0),
            metrics: anomalies,
            timestamp: Date.now()
        };
    }

    public async train(data: TimeSeriesMetric[]): Promise<void> {
        if (!data?.length) {
            throw new Error('Training data is empty');
        }

        try {
            const flattenedData = data.flatMap(metric => {
                if (!metric.instructionFrequency?.length) {
                    throw new Error('Invalid metric data');
                }
                return [
                    ...metric.instructionFrequency,
                    ...metric.executionTime,
                    ...metric.memoryUsage,
                    ...metric.cpuUtilization,
                    ...metric.errorRate,
                    ...metric.pdaValidation,
                    ...metric.accountDataMatching,
                    ...metric.cpiSafety,
                    ...metric.authorityChecks
                ];
            });

            flattenedData.forEach(value => this.updateStatistics(value));
            
            // Simulate training progress
            for (let epoch = 0; epoch < 5; epoch++) {
                this.emit('trainingProgress', {
                    epoch,
                    loss: Math.random() * 0.1
                });
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        } catch (error) {
            await this.cleanup();
            throw error;
        }
    }

    public async detect(data: TimeSeriesMetric[]): Promise<AnomalyResult> {
        if (!data?.length) {
            throw new Error('Detection data is empty');
        }

        if (this.dataWindow.length < this.config.minSampleSize) {
            throw new Error('Not enough samples for detection');
        }

        try {
            const flattenedData = data.flatMap(metric => {
                if (!metric.instructionFrequency?.length) {
                    throw new Error('Invalid metric data');
                }
                return [
                    ...metric.instructionFrequency,
                    ...metric.executionTime,
                    ...metric.memoryUsage,
                    ...metric.cpuUtilization,
                    ...metric.errorRate,
                    ...metric.pdaValidation,
                    ...metric.accountDataMatching,
                    ...metric.cpiSafety,
                    ...metric.authorityChecks
                ];
            });

            const result = this.detectAnomalies(flattenedData);
            this.emit('anomalyDetected', {
                isAnomaly: result.isAnomaly,
                confidence: result.score,
                details: result.metrics
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    public async cleanup(): Promise<void> {
        try {
            if (this.models.autoencoder) {
                await this.models.autoencoder.dispose();
                this.models.autoencoder = null;
            }
            if (this.models.lstm) {
                await this.models.lstm.dispose(); 
                this.models.lstm = null;
            }
            this.dataWindow = [];
            this.mean = 0;
            this.stdDev = 0;
            this.removeAllListeners();
            this.isInitialized = false;
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }
}
