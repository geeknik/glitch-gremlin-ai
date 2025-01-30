import * as tf from '@tensorflow/tfjs-node';
import { ModelConfig, TrainingResult, PredictionResult, ModelMetadata } from '@/types.js';

export abstract class BaseMLModel {
    protected model: tf.Sequential | null = null;
    protected readonly config: ModelConfig;
    protected metadata: ModelMetadata;

    constructor(config: ModelConfig) {
        this.config = config;
        this.metadata = {
            id: crypto.randomUUID(),
            createdAt: new Date(),
            lastTrainedAt: new Date(),
            modelVersion: config.modelVersion || '1.0.0',
            accuracy: 0,
            loss: 0,
            totalSamples: 0,
            epochs: 0,
            duration: 0
        };
    }

    public abstract train(features: number[][], labels: number[][]): Promise<TrainingResult>;
    public abstract predict(features: number[][]): Promise<PredictionResult>;
    protected abstract buildModel(): tf.Sequential;

    public async save(path: string): Promise<void> {
        if (!this.model) {
            throw new Error('Model not initialized');
        }
        await this.model.save(`file://${path}`);
        await this.saveMetadata(path);
    }

    public async load(path: string): Promise<void> {
        this.model = await tf.loadLayersModel(`file://${path}/model.json`) as tf.Sequential;
        await this.loadMetadata(path);
    }

    protected async saveMetadata(path: string): Promise<void> {
        const fs = await import('fs/promises');
        const metadataPath = `${path}/metadata.json`;
        await fs.writeFile(metadataPath, JSON.stringify(this.metadata, null, 2));
    }

    protected async loadMetadata(path: string): Promise<void> {
        const fs = await import('fs/promises');
        const metadataPath = `${path}/metadata.json`;
        const data = await fs.readFile(metadataPath, 'utf-8');
        this.metadata = JSON.parse(data);
    }

    public getMetadata(): ModelMetadata {
        return { ...this.metadata };
    }

    protected async updateTrainingMetrics(metrics: TrainingResult): Promise<void> {
        if (!this.metadata) {
            throw new Error('Model metadata not initialized');
        }

        this.metadata.lastTrainedAt = new Date();
        this.metadata.accuracy = metrics.accuracy;
        this.metadata.loss = metrics.loss;
        this.metadata.epochs = metrics.epochs;
        this.metadata.duration = metrics.duration;
    }

    protected validateFeatures(features: number[][]): void {
        if (!features.length) {
            throw new Error('Empty feature set provided');
        }

        const expectedShape = this.config.inputShape?.[0] || features[0].length;
        if (features[0].length !== expectedShape) {
            throw new Error(`Invalid feature shape: expected ${expectedShape}, got ${features[0].length}`);
        }
    }

    protected validateLabels(labels: number[][]): void {
        if (!labels.length) {
            throw new Error('Empty labels array');
        }
        if (labels.length !== labels.length) {
            throw new Error('Features and labels must have the same length');
        }
    }

    protected async preprocessFeatures(features: number[][]): Promise<tf.Tensor2D> {
        return tf.tidy(() => {
            const tensor = tf.tensor2d(features);
            return tensor.div(tf.scalar(255)) as tf.Tensor2D; // Normalize to [0, 1]
        });
    }

    protected async preprocessLabels(labels: number[][]): Promise<tf.Tensor2D> {
        return tf.tidy(() => {
            return tf.tensor2d(labels) as tf.Tensor2D;
        });
    }

    public async cleanup(): Promise<void> {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
    }
}

