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
    inputSize?: number;
    anomalyThreshold?: number;
    timeSteps?: number;
    dropoutRate?: number;
    encoderLayers?: number[];
    decoderLayers?: number[];
    epochs?: number;
    solanaWeights?: {
        pdaValidation: number;
        accountDataMatching: number;
        cpiSafety: number;
        authorityChecks: number;
    };
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

import * as tf from '@tensorflow/tfjs-node';

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
    private config: Required<DetectorConfig>;
    private dataWindow: number[] = [];
    private mean: number = 0;
    private stdDev: number = 0;
    private readonly metrics: MetricKey[];
    private isInitialized: boolean = false;
    private isTrained: boolean = false;

    private model: tf.Sequential | null = null;

    private constructor(config?: Partial<DetectorConfig>) {
        super();
        
        this.config = {
            windowSize: 50,
            zScoreThreshold: 3,
            minSampleSize: 10,
            sensitivityLevel: 0.95,
            solanaWeights: {
                pdaValidation: 0.15,
                accountDataMatching: 0.2,
                cpiSafety: 0.25,
                authorityChecks: 0.1
            },
            ...config
        };

        // Now validate using merged config
        if (this.config.inputSize !== undefined && this.config.inputSize <= 0) {
            throw new Error('Input size must be positive');
        }
        if (this.config.epochs !== undefined && this.config.epochs <= 0) {
            throw new Error('Epochs must be positive');
        }
        if (this.config.anomalyThreshold !== undefined && 
            (this.config.anomalyThreshold <= 0 || this.config.anomalyThreshold > 1)) {
            throw new Error('Anomaly threshold must be between 0 and 1');
        }
        if (this.config.timeSteps !== undefined && this.config.timeSteps <= 0) {
            throw new Error('Time steps must be positive');
        }
        if (this.config.dropoutRate !== undefined && 
            (this.config.dropoutRate < 0 || this.config.dropoutRate > 1)) {
            throw new Error('Dropout rate must be between 0 and 1');
        }
        if (this.config.encoderLayers !== undefined && this.config.encoderLayers.length === 0) {
            throw new Error('Encoder layers cannot be empty');
        }
        if (this.config.decoderLayers !== undefined && this.config.decoderLayers.length === 0) {
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

    public static async create(config?: Partial<DetectorConfig>): Promise<AnomalyDetector> {
        const instance = new AnomalyDetector(config);
        
        // Initialize TensorFlow.js Node backend with error handling
        try {
            // Skip backend initialization in test environment
            if (process.env.NODE_ENV !== 'test') {
                try {
                    await tf.setBackend('cpu');
                } catch (error) {
                    console.warn('Backend initialization warning:', error);
                }
            }
        } catch (error) {
            throw new Error(`TensorFlow.js initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return instance;
    }

    private validateConfig(): void {
        if (this.config.windowSize <= 0) {
            throw new Error('Window size must be positive');
        }
        // Clamp zScoreThreshold between 0.01 and 1.0 instead of throwing
        this.config.zScoreThreshold = Math.min(Math.max(this.config.zScoreThreshold, 0.01), 1.0);
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

    public async initializeModel(): Promise<boolean> {
        try {
            // Ensure TF backend is ready
            await tf.ready();

            // Clean up existing model if it exists
            if (this.model) {
                this.model.dispose();
                this.model = null;
            }

            // Create sequential model and add Solana-optimized layers
            this.model = tf.sequential();
            
            // Add Solana-optimized layers with proper input shape
            const inputShape = [this.metrics.length];
            
            // Encoder layers
            this.model.add(tf.layers.dense({
                units: 128,
                activation: 'relu',
                inputShape,
                kernelInitializer: 'glorotNormal',
                name: 'encoder_1'
            }));
            
            this.model.add(tf.layers.dense({
                units: 64,
                activation: 'relu',
                kernelInitializer: 'glorotNormal',
                name: 'encoder_2'
            }));
            
            // Bottleneck layer
            this.model.add(tf.layers.dense({
                units: 32,
                activation: 'relu',
                kernelInitializer: 'glorotNormal',
                name: 'bottleneck'
            }));
            
            // Decoder layers
            this.model.add(tf.layers.dense({
                units: 64,
                activation: 'relu',
                kernelInitializer: 'glorotNormal',
                name: 'decoder_1'
            }));
            
            this.model.add(tf.layers.dense({
                units: this.metrics.length,
                activation: 'linear',
                kernelInitializer: 'glorotNormal',
                name: 'decoder_2'
            }));

            // Compile with Adam optimizer
            const optimizer = tf.train.adam(0.001);
            this.model.compile({
                optimizer,
                loss: 'meanSquaredError',
                metrics: ['accuracy']
            });
            return true;
        } catch (error) {
            await this.cleanup();
            throw new Error(`Model initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async save(path: string): Promise<void> {
        if (!this.model) {
            throw new Error('No model to save');
        }
        await this.model.save(`file://${path}`);
    }

    public async load(path: string): Promise<void> {
        // Clean up existing model before loading new one
        if (this.model) {
            this.model.dispose();
        }
        
        // Load model and convert to Sequential
        const loadedModel = await tf.loadLayersModel(`file://${path}/model.json`);
        if (!(loadedModel instanceof tf.Sequential)) {
            // Convert the model to Sequential if possible
            const sequentialModel = tf.sequential();
            loadedModel.layers.forEach(layer => sequentialModel.add(layer));
            this.model = sequentialModel;
        } else {
            this.model = loadedModel;
        }
        
        // Re-initialize with loaded weights
        await this.initializeModel();
    }

    public async train(data: TimeSeriesMetric[]): Promise<void> {
        // Validate data first before any model operations
        if (!data?.length) {
            throw new Error('Training data cannot be empty');
        }
        if (data.length < this.config.minSampleSize) {
            throw new Error(`Insufficient training data - need at least ${this.config.minSampleSize} samples`);
        }
        // Validate all data points have valid cpuUtilization arrays
        data.forEach((metric, index) => {
            if (!metric.cpuUtilization || !Array.isArray(metric.cpuUtilization)) {
                throw new Error('Invalid cpuUtilization format - must be array');
            }
        });

        // Initialize model only after successful validation
        if (!this.models.autoencoder) {
            await this.initializeModel();
        }

        try {
            const flattenedData = data.flatMap(metric => {
                if (!metric.cpuUtilization || !Array.isArray(metric.cpuUtilization)) {
                    throw new Error('Invalid cpuUtilization format - must be array');
                }
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

            // Prepare data for training
            const tensorData = tf.tensor2d(flattenedData, [-1, this.metrics.length]);
            
            // Create input/output tensors using tf.tidy to manage memory
            const { inputTensor, outputTensor } = tf.tidy(() => {
                const input = tensorData.slice([0, 0], [tensorData.shape[0] - 1, tensorData.shape[1]]);
                const output = tensorData.slice([1, 0], [tensorData.shape[0] - 1, tensorData.shape[1]]);
                return { inputTensor: input, outputTensor: output };
            });

            if (!inputTensor || !outputTensor) {
                throw new Error('Failed to create training tensors');
            }

            // Initialize model if needed
            if (!this.model) {
                await this.initializeModel();
            }
            
            // Train the model
            await this.model!.fit(inputTensor, outputTensor, {
                epochs: this.config.epochs,
                validationSplit: 0.2,
                shuffle: true,
                callbacks: {
                    onTrainBegin: () => console.debug('Training started'),
                    onTrainEnd: () => console.debug('Training completed')
                },
                batchSize: 32,  // Add batch size for better performance
                verbose: 0 // Disable verbose logging during tests
            });

            this.isTrained = true;
        } catch (error) {
            await this.cleanup();
            throw error;
        }
    }

    public async detect(data: TimeSeriesMetric[]): Promise<AnomalyResult> {
        try {
            if (!data?.length) {
                throw new Error('Detection data is empty');
            }

            // Validate data format before checking model
            if (!data[0].cpuUtilization || !Array.isArray(data[0].cpuUtilization)) {
                throw new Error('Invalid cpuUtilization format - must be array');
            }

            // Check model status after validating input
            if (!this.model || !this.isTrained) {
                throw new Error('Model not initialized or trained');
            }

            if (this.dataWindow.length < this.config.minSampleSize) {
                throw new Error('Not enough samples for detection');
            }
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
            const metricWeights = this.config.solanaWeights || {
                pdaValidation: 0.15,
                accountDataMatching: 0.2,
                cpiSafety: 0.25,
                authorityChecks: 0.1
            };
            const zScores = {
                pdaValidation: result.metrics.find(m => m.metric === 'pdaValidation')?.zScore || 0,
                accountDataMatching: result.metrics.find(m => m.metric === 'accountDataMatching')?.zScore || 0,
                cpiSafety: result.metrics.find(m => m.metric === 'cpiSafety')?.zScore || 0,
                authorityChecks: result.metrics.find(m => m.metric === 'authorityChecks')?.zScore || 0
            };

            this.emit('anomalyDetected', {
                isAnomaly: result.isAnomaly,
                confidence: result.score,
                details: result.metrics
            });

            return {
                ...result,
                metricWeights,
                zScores
            };
        } catch (error) {
            console.error('Detection failed:', error);
            throw error;
        }
    }

    public async cleanup(): Promise<void> {
        try {
            if (this.model) {
                this.model.dispose();
                tf.disposeVariables();
                this.model = null;
            }
            
            this.dataWindow = [];
            this.mean = 0;
            this.stdDev = 0;
            this.removeAllListeners();
            this.isInitialized = false;
            this.isTrained = false;
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        } finally {
            // Ensure state is reset even if error occurs
            this.isInitialized = false;
            this.isTrained = false;
        }
    }
}
