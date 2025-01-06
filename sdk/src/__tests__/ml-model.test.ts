import { VulnerabilityDetectionModel } from '../ai/ml-model';
import { VulnerabilityType } from '../types';
import * as tf from '@tensorflow/tfjs-node';

describe('VulnerabilityDetectionModel', () => {
    let model: VulnerabilityDetectionModel;

    beforeEach(async () => {
        model = new VulnerabilityDetectionModel();
        await (model as any).initializeModel();
    });

    afterEach(async () => {
        // Cleanup TensorFlow backend
        tf.dispose();
        tf.engine().endScope();
    });

    describe('training', () => {
        it('should train on sample data', async () => {
            const sampleData = [
                {
                    features: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
                    vulnerabilityType: VulnerabilityType.Reentrancy
                },
                {
                    features: [5, 4, 3, 2, 1, 5, 4, 3, 2, 1],
                    vulnerabilityType: VulnerabilityType.ArithmeticOverflow
                }
            ];

            await expect(model.train(sampleData)).resolves.not.toThrow();
        });
    });

    describe('prediction', () => {
        it('should make predictions with confidence scores', async () => {
            const features = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
            const prediction = await model.predict(features);

            expect(prediction).toHaveProperty('type');
            expect(prediction).toHaveProperty('confidence');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
        });
    });

    describe('model persistence', () => {
        it('should save and load model', async () => {
            const tempPath = './test-models';
            await model.save(tempPath);
            await expect(model.load(tempPath)).resolves.not.toThrow();
        });
    });
});
