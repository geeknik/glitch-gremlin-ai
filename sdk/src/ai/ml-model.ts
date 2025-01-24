import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityType } from './types.js';

export interface PredictionResult {
    type: VulnerabilityType;
    confidence: number;
}

export class VulnerabilityDetectionModel {
    private model: tf.Sequential | null = null;
    private initialized: boolean = false;

    constructor() {
        this.initialized = false;
        this.model = null;
        this.initializeModel();
    }

    private initializeModel() {
        this.model = tf.sequential();

        // Input layer
        this.model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [20]
        }));
        
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // Hidden layer
        this.model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // Output layer - one unit per vulnerability type
        this.model.add(tf.layers.dense({
            units: Object.keys(VulnerabilityType).length,
            activation: 'softmax'
        }));

        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        this.model = this.model;
        this.initialized = true;
    }

    async train(data: Array<{ features: number[]; label: VulnerabilityType }>): Promise<{ loss: number }> {
        if (!this.model || !this.initialized) {
            throw new Error('Model not initialized');
        }

        if (!data || data.length === 0) {
            throw new Error('Training data cannot be empty');
        }

        const xs = tf.tensor2d(data.map(d => d.features));
        const ys = tf.oneHot(
            tf.tensor1d(data.map(d => Object.values(VulnerabilityType).indexOf(d.label)), 'int32'),
            Object.keys(VulnerabilityType).length
        );

        try {
            const result = await this.model.fit(xs, ys, {
                epochs: 10,
                validationSplit: 0.2,
                shuffle: true
            });

            return {
                loss: Number(result.history.loss[result.history.loss.length - 1])
            };
        } finally {
            tf.dispose([xs, ys]);
        }
    }

    async predict(features: number[]): Promise<PredictionResult> {
        if (!this.model || !this.initialized) {
            throw new Error('Model not initialized');
        }

        if (features.length !== 20) {
            throw new Error('Invalid input: expected 20 features');
        }

        const input = tf.tensor2d([features]);
        try {
            const prediction = this.model.predict(input) as tf.Tensor;
            const probabilities = await prediction.data();
            const maxIndex = probabilities.indexOf(Math.max(...Array.from(probabilities)));

            return {
                type: Object.values(VulnerabilityType)[maxIndex],
                confidence: probabilities[maxIndex]
            };
        } finally {
            tf.dispose([input]);
        }
    }

    async save(path: string): Promise<void> {
        if (!this.model || !this.initialized) {
            throw new Error('Model not initialized');
        }

        if (!path) {
            throw new Error('Invalid save path specified');
        }
        await this.model.save(`file://${path}`);
    }

    async load(path: string): Promise<void> {
        try {
            this.model = await tf.loadLayersModel(`file://${path}/model.json`) as tf.Sequential;
            this.model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            this.initialized = true;
        } catch (error) {
            throw new Error(`Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
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
