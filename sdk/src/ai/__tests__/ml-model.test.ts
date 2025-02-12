import { BaseMLModel } from '../src/ml-model.js';
import { ModelConfig, TrainingResult, PredictionResult, VulnerabilityType } from '../../types.js';
import * as tf from '@tensorflow/tfjs-node';
import mockTf from '../__mocks__/@tensorflow/tfjs-node';
import type { Tensor2D } from '@tensorflow/tfjs-node';

jest.mock('@tensorflow/tfjs-node', () => mockTf);

class TestMLModel extends BaseMLModel {
    constructor(config?: Partial<ModelConfig>) {
        super({
            inputShape: [10],
            hiddenLayers: [64, 32],
            learningRate: 0.001,
            epochs: 10,
            batchSize: 32,
            threshold: 0.5,
            ...config
        });
    }

    public async train(features: number[][], labels: number[][]): Promise<TrainingResult> {
        this.validateFeatures(features);
        this.validateLabels(labels);
        
        const xs = await this.preprocessFeatures(features);
        const ys = await this.preprocessLabels(labels);
        
        if (!this.model) {
            this.model = this.buildModel();
        }
        
        const result = await this.model.fit(xs, ys, {
            epochs: 10,
            batchSize: 32,
            validationSplit: 0.2
        });
        
        const metrics = {
            loss: Number(result.history.loss[0]),
            accuracy: Number(result.history.acc[0]),
            epoch: 9,
            epochs: 10,
            duration: 1000
        };
        
        this.updateMetadata(metrics);
        return metrics;
    }

    public async predict(features: number[][]): Promise<PredictionResult> {
        this.validateFeatures(features);
        
        if (!this.model) {
            throw new Error('Model not initialized');
        }
        
        const xs = await this.preprocessFeatures(features);
        const prediction = await this.model.predict(xs) as tf.Tensor2D;
        const values = await prediction.data();
        prediction.dispose();
        
        return {
            vulnerabilityType: VulnerabilityType.ACCESS_CONTROL,
            confidence: Math.max(...Array.from(values)),
            timestamp: new Date(),
            modelVersion: '1.0.0',
            prediction: Array.from(values),
            details: 'Test prediction'
        };
    }

    protected buildModel(): tf.Sequential {
        const model = tf.sequential();
        
        model.add(tf.layers.dense({
            units: this.config.hiddenLayers[0],
            activation: 'relu',
            inputShape: this.config.inputShape
        }));
        
        for (let i = 1; i < this.config.hiddenLayers.length; i++) {
            model.add(tf.layers.dense({
                units: this.config.hiddenLayers[i],
                activation: 'relu'
            }));
        }
        
        model.add(tf.layers.dense({
            units: Object.keys(VulnerabilityType).length / 2, // Divide by 2 since enum has both keys and values
            activation: 'softmax'
        }));
        
        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        
        return model;
    }

    protected async preprocessFeatures(features: number[][]): Promise<tf.Tensor2D> {
        return tf.tidy(() => {
            const tensor = tf.tensor2d(features);
            return tensor.div(tf.scalar(255)) as tf.Tensor2D;
        });
    }

    protected async preprocessLabels(labels: number[][]): Promise<tf.Tensor2D> {
        return tf.tidy(() => {
            return tf.tensor2d(labels) as tf.Tensor2D;
        });
    }
}

describe('BaseMLModel', () => {
    let model: TestMLModel;

    beforeEach(() => {
        model = new TestMLModel();
    });

    afterEach(async () => {
        await model.cleanup();
    });

    describe('initialization', () => {
        it('should initialize with default config', () => {
            expect(model.getMetadata().config).toBeDefined();
            expect(model.getMetadata().config.learningRate).toBe(0.001);
            expect(model.getMetadata().config.hiddenLayers).toEqual([64, 32]);
        });

        it('should throw error for invalid learning rate', () => {
            expect(() => new TestMLModel({ learningRate: -1 })).toThrow();
        });

        it('should throw error for empty hidden layers', () => {
            expect(() => new TestMLModel({ hiddenLayers: [] })).toThrow();
        });
    });

    describe('training', () => {
        it('should throw error for empty training data', async () => {
            await expect(model.train([], [])).rejects.toThrow('Empty features array');
        });

        it('should handle training data mismatch', async () => {
            await expect(model.train([[1]], [[1, 1]])).rejects.toThrow();
        });

        it('should update metadata after training', async () => {
            const features = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]];
            const labels = [[1, 0]];
            await model.train(features, labels);
            expect(model.getMetadata().metrics.accuracy).toBeGreaterThan(0);
        });
    });

    describe('prediction', () => {
        it('should throw error for invalid input shape', async () => {
            await expect(model.predict([[]])).rejects.toThrow();
        });

        it('should return valid prediction shape', async () => {
            const features = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]];
            const result = await model.predict(features);
            expect(result.prediction).toBeDefined();
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });
    });

    describe('model persistence', () => {
        it('should save and load model', async () => {
            const features = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]];
            await model.train(features, [[1, 0]]);
            
            await model.save('/tmp/test-model');
            await model.load('/tmp/test-model');
            
            const result = await model.predict(features);
            expect(result.prediction).toBeDefined();
        });
    });
});
