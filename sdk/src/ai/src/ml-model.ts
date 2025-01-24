import * as tf from '@tensorflow/tfjs-node';
import type { PredictionResult } from './types';
import type VulnerabilityDetectionModel from './types';
import { VulnerabilityType } from './types';

export class VulnerabilityDetectionModelImpl implements VulnerabilityDetectionModel {
    private model: tf.LayersModel;
    private initialized: boolean = false;

    constructor() {
        this.model = this.buildModel();
    }

    async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            // Try to initialize with default weights if not trained
            const model = this.buildModel();
            await model.compile({
                optimizer: 'adam',
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            this.model = model;
            this.initialized = true;
            await this.model.loadWeights({}); // Ensure weights are loaded
        }
    }

    private buildModel(): tf.LayersModel {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ units: 64, activation: 'relu', inputShape: [100] }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 32, activation: 'relu' }),
                tf.layers.dense({ units: Object.keys(VulnerabilityType).length, activation: 'softmax' })
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy'] 
        });

        return model;
    }

    async train(features: number[][], labels: number[]): Promise<void> {
        if (!features.length || !labels.length) return;
        if (features.length > 100000) {
            throw new Error('Training dataset exceeds maximum size of 100,000 samples');
        }

        // Add resource limits
        const maxMemory = 1024 * 1024 * 1024; // 1GB
        const xs = tf.tensor2d(features);
        const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), Object.keys(VulnerabilityType).length);

        // Check memory constraints
        if (xs.size * 4 + ys.size * 4 > maxMemory) {
            xs.dispose();
            ys.dispose();
            throw new Error('Training data exceeds available memory budget');
        }

        await this.model.fit(xs, ys, {
            epochs: 10,
            batchSize: 32,
            validationSplit: 0.2
        });

        xs.dispose();
        ys.dispose();
        this.initialized = true;
    }

    async predict(features: number[]): Promise<{
        type: VulnerabilityType;
        confidence: number;
    }> {
        if (!this.initialized) {
            throw new Error('Model not trained');
        }
        if (features.length !== 100) {
            throw new Error('Invalid feature vector length');
        }

        // Add security metrics collection
        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        const input = tf.tensor2d([features]);
        const prediction = this.model.predict(input) as tf.Tensor;
        const probabilities = await prediction.array() as number[][];

        // Collect security metrics
        const execTime = Date.now() - startTime;
        const memoryUsed = process.memoryUsage().heapUsed - startMemory;
        console.log(`Security metrics - Execution time: ${execTime}ms, Memory used: ${memoryUsed} bytes`);

        input.dispose();
        prediction.dispose();

        const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
        return {
            type: Object.values(VulnerabilityType)[maxIndex],
            confidence: probabilities[0][maxIndex]
        };
    }

    async cleanup(): Promise<void> {
        if (this.model) {
            (this.model as any).dispose();
        }
        (tf as any).disposeVariables();
    }

    async save(path: string): Promise<void> {
        await this.model.save(`file://${path}`);
    }

    async load(path: string): Promise<void> {
        this.model = await tf.loadLayersModel(`file://${path}`);
        this.initialized = true;
    }
}

