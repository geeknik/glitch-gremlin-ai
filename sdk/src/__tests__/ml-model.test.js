import { VulnerabilityDetectionModel } from '../ai/ml-model';
import { VulnerabilityType } from '../types';
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';

describe('VulnerabilityDetectionModel Tests', () => {
    let model;
    const TEST_MODEL_DIR = './test-models';

    beforeAll(async () => {
        await tf.setBackend('cpu');
        await tf.ready();
        
        // Create test directory if it doesn't exist
        if (!fs.existsSync(TEST_MODEL_DIR)) {
            fs.mkdirSync(TEST_MODEL_DIR, { recursive: true });
        }
    });

    beforeEach(() => {
        model = new VulnerabilityDetectionModel();
    });

    afterEach(async () => {
        if (model) {
            await model.cleanup();
        }
        tf.disposeVariables();
    });

    afterAll(async () => {
        tf.disposeVariables();
        // Clean up test directory
        if (fs.existsSync(TEST_MODEL_DIR)) {
            fs.rmSync(TEST_MODEL_DIR, { recursive: true, force: true });
        }
    });

    describe('training', () => {
        it('should train on sample data', async () => {
            const sampleData = [
                {
                    features: new Array(20).fill(0).map((_, i) => i % 10),
                    label: VulnerabilityType.Reentrancy
                },
                {
                    features: new Array(20).fill(0).map((_, i) => (i + 1) % 10),
                    label: VulnerabilityType.ArithmeticOverflow
                }
            ];
            await expect(model.train(sampleData)).resolves.not.toThrow();
        });
    });

    describe('predictions', () => {
        beforeEach(async () => {
            // Train the model before testing predictions
            const sampleData = [
                {
                    features: new Array(20).fill(0).map((_, i) => i % 10),
                    label: VulnerabilityType.Reentrancy
                },
                {
                    features: new Array(20).fill(0).map((_, i) => (i + 1) % 10),
                    label: VulnerabilityType.ArithmeticOverflow
                }
            ];
            await model.train(sampleData);
        });

        it('should make predictions with confidence scores', async () => {
            const features = new Array(20).fill(0).map((_, i) => i % 10);
            const prediction = await model.predict(features);
            expect(prediction).toHaveProperty('type');
            expect(prediction).toHaveProperty('confidence');
            expect(prediction).toHaveProperty('details');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(Array.isArray(prediction.details)).toBe(true);
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
            expect(Array.isArray(prediction.details)).toBe(true);
        });
    });

    describe('model persistence', () => {
        it('should save and load model', async () => {
            const modelPath = path.join(TEST_MODEL_DIR, 'model');
            await model.save(modelPath);
            await expect(model.load(modelPath)).resolves.not.toThrow();
        });
    });
});
