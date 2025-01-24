import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityType } from './types';
export class VulnerabilityDetectionModelImpl {
    constructor() {
        this.initialized = false;
        this.model = this.buildModel();
    }
    async ensureInitialized() {
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
    buildModel() {
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
    async train(features, labels) {
        if (!features.length || !labels.length)
            return;
        const xs = tf.tensor2d(features);
        const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), Object.keys(VulnerabilityType).length);
        await this.model.fit(xs, ys, {
            epochs: 10,
            batchSize: 32,
            validationSplit: 0.2
        });
        xs.dispose();
        ys.dispose();
        this.initialized = true;
    }
    async predict(features) {
        if (!this.initialized) {
            throw new Error('Model not trained');
        }
        const input = tf.tensor2d([features]);
        const prediction = this.model.predict(input);
        const probabilities = await prediction.array();
        input.dispose();
        prediction.dispose();
        const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
        return {
            type: Object.values(VulnerabilityType)[maxIndex],
            confidence: probabilities[0][maxIndex]
        };
    }
    async cleanup() {
        if (this.model) {
            this.model.dispose();
        }
        tf.disposeVariables();
    }
    async save(path) {
        await this.model.save(`file://${path}`);
    }
    async load(path) {
        this.model = await tf.loadLayersModel(`file://${path}`);
        this.initialized = true;
    }
}
