import * as tf from '@tensorflow/tfjs-node';
import { TimeSeriesMetric, ModelConfig, AnomalyResult, TrainingResult } from './types.js';

export class AnomalyDetector {
    private model: tf.Sequential | null = null;
    private config: ModelConfig;
    private initialized: boolean = false;

    constructor(config: Partial<ModelConfig> = {}) {
        this.config = this.validateConfig(config);

        this.initializeModel();
    }

    private validateConfig(config: Partial<ModelConfig>): ModelConfig {
        const validatedConfig = {
            windowSize: config.windowSize ?? 10,
            threshold: config.threshold ?? 0.8,
            learningRate: config.learningRate ?? 0.001,
            epochs: config.epochs ?? 10
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

    private initializeModel() {
        this.model = tf.sequential();

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

        this.initialized = true;
    }

    private preprocessData(data: TimeSeriesMetric[]): tf.Tensor2D {
        return tf.tidy(() => {
            const values = data.map(d => d.value);
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
        if (!this.model || !this.initialized) {
            throw new Error('Model not initialized');
        }

        if (!data || data.length === 0) {
            throw new Error('Training data cannot be empty');
        }

        const processedData = this.preprocessData(data);
        const [sequences, targets] = this.createSequences(processedData);

        try {
            const result = await this.model.fit(sequences, targets, {
                epochs: this.config.epochs,
                validationSplit: 0.2,
                shuffle: true
            });

            return {
                loss: Number(result.history.loss[result.history.loss.length - 1]),
                metrics: {
                    valLoss: Number(result.history.val_loss[result.history.val_loss.length - 1])
                }
            };
        } finally {
            tf.dispose([processedData, sequences, targets]);
        }
    }

    async detectAnomaly(metric: TimeSeriesMetric): Promise<AnomalyResult> {
        if (!this.model || !this.initialized) {
            throw new Error('Model not initialized');
        }

        const input = tf.tensor2d([[metric.value]]);
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
        if (!this.model || !this.initialized) {
            throw new Error('Model not initialized');
        }
        await this.model.save(`file://${path}`);
    }

    async load(path: string): Promise<void> {
        try {
            this.model = await tf.loadLayersModel(`file://${path}/model.json`) as tf.Sequential;
            this.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            this.initialized = true;
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
