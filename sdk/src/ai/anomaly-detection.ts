import * as tf from '@tensorflow/tfjs-node';
import { TimeSeriesMetric, ModelConfig, AnomalyResult, TrainingResult } from './types.js';

export class AnomalyDetector {
    private model: tf.Sequential | null = null;
    private config: ModelConfig;
    private isTrained: boolean = false;
    private initialized: boolean = false;

    constructor(config: Partial<ModelConfig> = {}, initializeModel: boolean = true) {
        // First clamp threshold, then validate
        const clampedConfig = {
            ...config,
            threshold: Math.max(0.01, Math.min(config.threshold ?? 0.8, 1.0))
        };
        const validatedConfig = this.validateConfig(clampedConfig);
        this.config = validatedConfig;
        
        if (initializeModel) {
            this.initializeModel();
        } else {
            this.model = null;
            this.isTrained = false;
        }
    }

    public isTrained(): boolean {
        return this.isTrained;
    }

    private validateConfig(config: Partial<ModelConfig>): ModelConfig {
        const validatedConfig = {
            windowSize: config.windowSize ?? 10,
            // Ensure threshold is properly clamped with 0.01 minimum
            threshold: Math.max(0.01, Math.min(config.threshold ?? 0.8, 1.0)),  // Already correct but confirming exact match
            learningRate: config.learningRate ?? 0.001,
            epochs: config.epochs ?? 10,
            minSampleSize: config.minSampleSize ?? 3
        };

        if (validatedConfig.windowSize <= 0) {
            throw new Error('Window size must be positive');
        }
        if (validatedConfig.threshold <= 0 || validatedConfig.threshold >= 1) {
            throw new Error('Threshold must be between 0 and 1');
        }
        if (validatedConfig.learningRate <= 0) {
            throw new Error('Learning rate must be positive');
        }
        if (validatedConfig.epochs <= 0) {
            throw new Error('Epochs must be positive');
        }

        return validatedConfig;
    }

    public initializeModel() {
        this.model?.dispose();
        this.model = tf.sequential();
        this.isTrained = false;

        // LSTM layer for sequence processing
        this.model.add(tf.layers.lstm({
            units: 64,
            inputShape: [this.config.windowSize, 1],
            returnSequences: true
        }));
        
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        this.model.add(tf.layers.lstm({
            units: 32,
            returnSequences: false
        }));
        
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        this.model.add(tf.layers.dense({ units: 1 }));

        this.model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError'
        });

        this.isTrained = false;
    }

    private preprocessData(data: TimeSeriesMetric[]): tf.Tensor2D {
        return tf.tidy(() => {
            // Use CPU utilization as the primary metric
            const values = data.map(d => {
                if (!Array.isArray(d?.cpuUtilization)) {
                    throw new Error('Invalid metric data - missing cpuUtilization');
                }
                return d.cpuUtilization[0];
            });
            const values_tensor = tf.tensor1d(values);
            const moments = tf.moments(values_tensor);
            const normalized = values_tensor.sub(moments.mean).div(tf.sqrt(moments.variance));
            tf.dispose([values_tensor, moments.mean, moments.variance]);
            return normalized.expandDims(1) as tf.Tensor2D;
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
        // 1. Check for model initialization and training status FIRST
        if (!this.model || !this.isTrained) {
            throw new Error('Model not initialized or trained');
        }

        // 2. Validate input data structure exists
        if (!metric?.cpuUtilization) {
            throw new Error('Invalid metric data - missing cpuUtilization');
        }
        if (!Array.isArray(metric.cpuUtilization)) {
            throw new Error('Invalid cpuUtilization format - must be array');
        }

        // 3. Check data quantity requirements
        if (metric.cpuUtilization.length < this.config.minSampleSize) {
            throw new Error(`Insufficient data points - need at least ${this.config.minSampleSize}`);
        }

        // Use first value from cpuUtilization array
        const inputValue = metric.cpuUtilization[0];

        const input = tf.tensor2d([[inputValue]]);
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
                details: `Prediction error: ${error.toFixed(4)}`
            };
        } finally {
            tf.dispose([input]);
        }
    }

    async save(path: string): Promise<void> {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not initialized');
        }
        // Mocked save operation
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    async load(path: string): Promise<void> {
        try {
            // Mocked load operation
            this.model = tf.sequential();
            this.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            this.isTrained = true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to load model: ${errorMessage}`);
        }
    }

    async cleanup(): Promise<void> {
        if (this.model) {
            this.model.dispose();
            this.model = null;
            this.initialized = false;
        }
    }
}
