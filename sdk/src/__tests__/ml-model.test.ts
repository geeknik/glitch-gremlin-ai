import { VulnerabilityDetectionModel } from '../ai/ml-model';
import { VulnerabilityType } from '../types';
import * as tf from '@tensorflow/tfjs-node';

describe('VulnerabilityDetectionModel', () => {
    let model: VulnerabilityDetectionModel;

    beforeEach(async () => {
        model = new VulnerabilityDetectionModel();
        await model.ensureInitialized();
    });

    afterEach(async () => {
        await model.cleanup();
    });

    describe('training', () => {
        it('should train on sample data', async () => {
            const sampleData = [
                {
                    features: new Array(20).fill(0).map((_, i) => i % 10),
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
            const features = new Array(20).fill(0).map((_, i) => i % 10);
            const prediction = await model.predict(features);

            expect(prediction).toHaveProperty('type');
            expect(prediction).toHaveProperty('confidence');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
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
