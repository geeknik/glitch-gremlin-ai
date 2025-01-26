import * as tf from '@tensorflow/tfjs-node-gpu';
import type { TimeSeriesMetric, AnomalyResult } from './types.js';

interface ModelConfig {
    windowSize: number;
    zScoreThreshold: number;
    learningRate: number;
    epochs: number;
    minSampleSize: number;
    threshold: number;
}

interface TrainingResult {
    loss: number;
    metrics: {
        valLoss: number;
    };
}

export class AnomalyDetector {
    private model: tf.Sequential | null = null;
    private config: ModelConfig;
    private isTrained: boolean = false;
    private initialized: boolean = false;

    constructor(config: Partial<ModelConfig> = {}, initializeModel: boolean = true) {
        // First validate raw values
        if (config.windowSize !== undefined && config.windowSize <= 0) {
            throw new Error('Window size must be positive');
        }
        if (config.learningRate !== undefined && config.learningRate <= 0) {
            throw new Error('Learning rate must be positive');
        }
        if (config.zScoreThreshold !== undefined && config.zScoreThreshold <= 0) {
            throw new Error('Z-score threshold must be positive');
        }

        // Then create validated config with clamped values
        const validatedConfig = {
            windowSize: config.windowSize ?? 10,
            zScoreThreshold: Math.max(0.01, Math.min(config.zScoreThreshold ?? 0.8, 1.0)),
            learningRate: config.learningRate ?? 0.001,
            epochs: config.epochs ?? 10,
            minSampleSize: config.minSampleSize ?? 3,
            threshold: config.threshold ?? 0.8
        };

        this.config = validatedConfig;
        
        if (initializeModel) {
            this.initializeModel();
        } else {
            this.model = null;
            this.isTrained = false;
        }
    }

    public isModelTrained(): boolean {
        return this.isTrained;
    }

    private validateConfig(config: Partial<ModelConfig>): ModelConfig {
        // Use already clamped values from constructor
        const validatedConfig = {
            windowSize: config.windowSize ?? 10,
            zScoreThreshold: Math.max(0.01, Math.min(config.zScoreThreshold ?? 0.8, 1.0)),
            learningRate: config.learningRate ?? 0.001,
            epochs: config.epochs ?? 10,
            minSampleSize: config.minSampleSize ?? 3,
            threshold: config.threshold ?? 0.8
        };

        if (validatedConfig.windowSize <= 0) {
            throw new Error('Window size must be positive');
        }
        if (validatedConfig.learningRate <= 0) {
            throw new Error('Learning rate must be positive');
        }
        if (validatedConfig.epochs <= 0) {
            throw new Error('Epochs must be positive');
        }
        if (validatedConfig.minSampleSize <= 0) {
            throw new Error('Minimum sample size must be positive');
        }

        return validatedConfig;
    }

    public initializeModel() {
        this.model?.dispose();
        this.model = tf.sequential();
        this.isTrained = false;

        // Input layer matching Solana metric dimensions
        this.model.add(tf.layers.dense({
            units: 128,
            inputShape: [8], // 5 metrics (cpu + 4 Solana) with value + zScore
            activation: 'relu'
        }));
        
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // Hidden layer
        this.model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        // Output layer
        this.model.add(tf.layers.dense({
            units: 10,
            activation: 'linear'
        }));

        this.model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError'
        });

        this.isTrained = false;
    }

    private preprocessData(data: TimeSeriesMetric[]): tf.Tensor2D {
        return tf.tidy(() => {
            // Process all metrics with Solana-specific weights
            const features = data.map(d => [
                ...(d.cpuUtilization || []),
                ...(d.pdaValidation || []),
                ...(d.accountDataMatching || []),
                ...(d.cpiSafety || []),
                ...(d.authorityChecks || [])
            ].map(Number));

            // Ensure uniform feature length
            const featureLength = Math.max(...features.map(f => f.length));
            const paddedFeatures = features.map(f => 
                f.length === featureLength ? f : [...f, ...new Array(featureLength - f.length).fill(0)]
            );

            const tensor = tf.tensor2d(paddedFeatures);
            const { mean, variance } = tf.moments(tensor, 0);
            const normalized = tensor.sub(mean).div(variance.sqrt().add(1e-7));
            
            return normalized as tf.Tensor2D;
        });
    }

    private createSequences(data: tf.Tensor2D): [tf.Tensor3D, tf.Tensor2D] {
        return tf.tidy(() => {
            const sequences: number[][][] = [];
            const targets: number[][] = [];
            
            const dataArray = data.arraySync() as number[][];
            for (let i = 0; i < dataArray.length - this.config.windowSize; i++) {
                sequences.push(dataArray.slice(i, i + this.config.windowSize));
                targets.push(dataArray[i + this.config.windowSize]);
            }

            return [
                tf.tensor3d(sequences),
                tf.tensor2d(targets)
            ];
        });
    }

    async train(data: TimeSeriesMetric[]): Promise<TrainingResult> {
        if (!this.model) {
            throw new Error('Model not initialized');
        }

        if (!data || data.length === 0) {
            throw new Error('Training data cannot be empty');
        }
        if (data.length < this.config.minSampleSize) {
            throw new Error(`Insufficient training data - need at least ${this.config.minSampleSize} samples`);
        }

        const processedData = this.preprocessData(data);
        const [sequences, targets] = this.createSequences(processedData);

        try {
            const result = await this.model.fit(sequences, targets, {
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
            
            return {
                loss: Number(result.history.loss[result.history.loss.length - 1]),
                metrics: {
                    valLoss: Number(result.history.val_loss[result.history.val_loss.length - 1])
                }
            };
        } catch (error) {
            console.error('Training failed:', error);
            throw error;
        } finally {
            tf.dispose([processedData, sequences, targets]);
        }
    }

    async detect(metric: TimeSeriesMetric): Promise<AnomalyResult> {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not initialized or trained');
        }

        // Process all Solana-relevant metrics
        const inputData = [
            ...(metric.cpuUtilization || []),
            ...(metric.pdaValidation || []),
            ...(metric.accountDataMatching || []), 
            ...(metric.cpiSafety || []),
            ...(metric.authorityChecks || [])
        ].map(Number);

        if (inputData.length < this.config.minSampleSize) {
            throw new Error(`Insufficient data points - need at least ${this.config.minSampleSize}`);
        }

        const input = tf.tensor2d([inputData]);
        try {
            const prediction = this.model.predict(input) as tf.Tensor;
            const [predicted, actual] = await Promise.all([
                prediction.data(),
                input.data()
            ]);

            const error = Math.abs(predicted[0] - actual[0]);
            const isAnomaly = error > this.config.threshold;
            const confidence = Math.min(error / this.config.threshold, 1);

            return {
                isAnomaly,
                confidence,
                details: `Prediction error: ${error.toFixed(4)}`,
                metricWeights: {
                    pdaValidation: 0,
                    accountDataMatching: 0,
                    cpiSafety: 0,
                    authorityChecks: 0
                },
                zScores: {
                    pdaValidation: 0,
                    accountDataMatching: 0,
                    cpiSafety: 0,
                    authorityChecks: 0
                }
            };
        } finally {
            tf.dispose([input]);
        }
    }

    async save(path: string): Promise<void> {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not initialized or trained');
        }
        // Mock save operation
        return Promise.resolve();
    }

    async load(path: string): Promise<void> {
        if (!this.model) {
            this.initializeModel();
        }
        // Mock load operation
        return Promise.resolve();
    }

    async cleanup(): Promise<void> {
        if (this.model) {
            this.model.dispose();
            this.model = null;
            this.initialized = false;
        }
    }
}
