import * as tf from '@tensorflow/tfjs-node';
import { MLModel } from './ml-model.js';
import { TimeSeriesMetric, MetricType, ModelConfig, TrainingResult, AnomalyReport } from './types.js';
import { History } from '@tensorflow/tfjs-node';

export interface AnomalyDetectionConfig extends ModelConfig {
    metricTypes: MetricType[];
    outputShape: number; // Required by MLConfig
}

export interface AnomalyDetectionResult {
    isAnomaly: boolean;
    score: number;
    timestamp: number;
    metric: TimeSeriesMetric;
    threshold: number;
    details?: {
        expectedValue: number;
        actualValue: number;
        deviation: number;
    };
}

export class AnomalyDetector extends MLModel {
    private isTrained: boolean = false;
    protected readonly config: AnomalyDetectionConfig;
    private readonly threshold: number;

    constructor(config: AnomalyDetectionConfig) {
        super(config);
        this.config = config;
        this.threshold = config.threshold;
    }

    public async train(x: tf.Tensor | number[][], y: tf.Tensor | number[][], config: { epochs: number; batchSize: number }): Promise<History> {
        try {
            const result = await super.train(x, y, config);
            this.isTrained = true;
            return result;
        } catch (error) {
            console.error('Training failed:', error);
            throw error;
        }
    }

    public async detect(metric: TimeSeriesMetric): Promise<AnomalyDetectionResult> {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained');
        }

        const input = this.preprocessMetric(metric);
        const prediction = this.model.predict(input) as tf.Tensor;
        const reconstructionError = this.calculateReconstructionError(input, prediction);
        
        const isAnomaly = reconstructionError > this.threshold;
        const expectedValue = prediction.dataSync()[0];
        const actualValue = input.dataSync()[0];

        // Cleanup tensors
        input.dispose();
        prediction.dispose();

        return {
            isAnomaly,
            score: reconstructionError,
            timestamp: Date.now(),
            metric,
            threshold: this.threshold,
            details: {
                expectedValue,
                actualValue,
                deviation: Math.abs(expectedValue - actualValue)
            }
        };
    }

    private preprocessMetric(metric: TimeSeriesMetric): tf.Tensor {
        // Calculate z-score using the metric's value
        const zScore = (metric.value - this.calculateMean(metric)) / this.calculateStdDev(metric);
        return tf.tensor2d([[zScore]]);
    }

    private calculateMean(metric: TimeSeriesMetric): number {
        // In a real implementation, this would use historical values
        // For now, we'll use a simple approach
        return metric.value;
    }

    private calculateStdDev(metric: TimeSeriesMetric): number {
        // In a real implementation, this would use historical values
        // For now, we'll return 1 to avoid division by zero
        return 1;
    }

    private calculateReconstructionError(input: tf.Tensor, prediction: tf.Tensor): number {
        const inputData = input.dataSync();
        const predictionData = prediction.dataSync();
        
        // Calculate Mean Squared Error
        let sumSquaredError = 0;
        for (let i = 0; i < inputData.length; i++) {
            sumSquaredError += Math.pow(inputData[i] - predictionData[i], 2);
        }
        return Math.sqrt(sumSquaredError / inputData.length);
    }

    public async save(path: string): Promise<void> {
        if (!this.model) {
            throw new Error('No model to save');
        }
        await this.model.save(`file://${path}`);
    }

    public async load(path: string): Promise<void> {
        try {
            this.model = await tf.loadLayersModel(`file://${path}/model.json`);
            this.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError',
                metrics: ['accuracy']
            });
            this.isTrained = true;
        } catch (error) {
            console.error('Failed to load model:', error);
            throw error;
        }
    }

    public getConfig(): AnomalyDetectionConfig {
        return { ...this.config };
    }

    public isModelTrained(): boolean {
        return this.isTrained;
    }

    public async getModelSummary(): Promise<string> {
        if (!this.model) {
            return 'Model not initialized';
        }
        
        return new Promise<string>((resolve) => {
            let summary = '';
            this.model?.summary(undefined, undefined, (line) => {
                summary += line + '\n';
            });
            resolve(summary);
        });
    }
}
