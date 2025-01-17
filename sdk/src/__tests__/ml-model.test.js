import { VulnerabilityDetectionModel } from '../ai/ml-model';
import { VulnerabilityType } from '../types';
import * as tf from '@tensorflow/tfjs-node';
describe('VulnerabilityDetectionModel Tests', () => {
    let model;
    beforeAll(async () => {
        await tf.ready();
        await tf.setBackend('cpu');
    });
    beforeEach(() => {
        model = new VulnerabilityDetectionModel();
    });
    afterEach(async () => {
        await model.cleanup();
        // Clear all tensors between tests
        tf.disposeVariables();
    });
    afterAll(async () => {
        await tf.dispose();
    });
    describe('training', () => {
        it('should train on sample data', async () => {
            const sampleData = [
                {
                    features: new Array(20).fill(0).map((_, i) => i % 10),
                    vulnerabilityType: VulnerabilityType.Reentrancy
                },
                {
                    features: new Array(20).fill(0).map((_, i) => (i + 1) % 10),
                    vulnerabilityType: VulnerabilityType.ArithmeticOverflow
                }
            ];
            await expect(model.train(sampleData)).resolves.not.toThrow();
        });
    });
    describe('predictions', () => {
        it('should make predictions with confidence scores', async () => {
            const features = new Array(20).fill(0).map((_, i) => i % 10);
            const prediction = await model.predict(features);
            expect(prediction).toHaveProperty('type');
            expect(prediction).toHaveProperty('confidence');
            expect(prediction).toHaveProperty('details');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
        });
        it('should detect high-risk patterns', async () => {
            const features = new Array(20).fill(0);
            features[0] = 0.9; // High transaction volume
            features[1] = 0.8; // High error rate
            const prediction = await model.predict(features);
            expect(prediction.confidence).toBeGreaterThan(0.1);
            expect(prediction.details).toContain('High transaction volume');
            expect(prediction.type).toBeDefined();
        });
        it('should handle edge cases', async () => {
            const features = new Array(20).fill(1); // All high values
            const prediction = await model.predict(features);
            expect(prediction.confidence).toBeGreaterThan(0.1);
            expect(prediction.type).toBeDefined();
        });
    });
    describe('model persistence', () => {
        it('should save and load model', async () => {
            const tempDir = './test-models';
            const modelPath = `${tempDir}/model`;
            await model.save(modelPath);
            await expect(model.load(`${modelPath}`)).resolves.not.toThrow();
        });
    });
});
