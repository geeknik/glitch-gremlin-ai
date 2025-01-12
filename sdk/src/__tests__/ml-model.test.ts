import { jest, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { VulnerabilityDetectionModel, VulnerabilityType, generateTrainingData } from '../ai/vulnerability-detection.js';
import * as tf from '@tensorflow/tfjs-node';

describe('VulnerabilityDetectionModel Tests', () => {
    let model: VulnerabilityDetectionModel;
    let memoryLeakListener: any;

    beforeAll(async () => {
        // Explicitly set backend to CPU and disable warnings
        tf.env().set('IS_NODE', true);
        await tf.setBackend('cpu');
        tf.env().set('DEBUG', false);
        
        // Initialize with a clean state
        await tf.ready();
        memoryLeakListener = tf.memory().numTensors;
    });

    beforeEach(async () => {
        model = new VulnerabilityDetectionModel();
    });

    afterEach(async () => {
        // Clean up model and tensors
        if (model) {
            await model.cleanup();
        }
        // Dispose all tensors and verify cleanup
        tf.disposeVariables();
        tf.engine().startScope();
        tf.engine().endScope();
        
        // Allow some flexibility in tensor count due to TF.js internals
        expect(tf.memory().numTensors).toBeLessThanOrEqual(memoryLeakListener + 2);
    });

    afterAll(async () => {
        await tf.dispose();
    });

    describe('training', () => {

        it('should train on small sample dataset and validate results', async () => {
            const sampleData = generateTrainingData(10);
            await model.train(sampleData);
            
            // Verify model is trained
            const testFeatures = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predict(testFeatures);
            
            expect(prediction.type).toBeDefined();
            expect(prediction.confidence).toBeGreaterThan(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(prediction.details).toBeInstanceOf(Array);
        });

        it('should handle empty training data gracefully', async () => {
            await expect(model.train([])).rejects.toThrow('Training data cannot be empty');
        });

        it('should handle invalid feature dimensions', async () => {
            const invalidData = [{
                features: [1, 2], // Wrong dimension
                vulnerabilityType: VulnerabilityType.Reentrancy
            }];
            await expect(model.train(invalidData)).rejects.toThrow(
                'Input feature array must have exactly 20 elements'
            );
        });

        it('should maintain consistent tensor count after training', async () => {
            const initialTensors = tf.memory().numTensors;
            const sampleData = generateTrainingData(5);
            
            await model.train(sampleData);
            
            // Verify no tensor leaks
            expect(tf.memory().numTensors).toBe(initialTensors);
        });
    });

    describe('predictions', () => {
        beforeEach(async () => {
            // Train the model with minimal dataset before prediction tests
            const sampleData = generateTrainingData(5);
            await model.train(sampleData);
        });

        it('should make predictions with proper confidence scores', async () => {
            const features = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predict(features);

            expect(prediction.type).toBeDefined();
            expect(typeof prediction.confidence).toBe('number');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(prediction.details).toBeInstanceOf(Array);
            expect(prediction.details.length).toBeGreaterThan(0);
        });

        it('should handle extreme feature values', async () => {
            // Test with all zeros
            const zeroFeatures = new Array(20).fill(0);
            const zeroPrediction = await model.predict(zeroFeatures);
            expect(zeroPrediction.type).toBeDefined();

            // Test with all ones
            const oneFeatures = new Array(20).fill(1);
            const onePrediction = await model.predict(oneFeatures);
            expect(onePrediction.type).toBeDefined();
        });

        it('should provide meaningful details for predictions', async () => {
            const features = new Array(20).fill(0).map((_, i) => i === 0 ? 0.9 : 0.1);
            const prediction = await model.predict(features);

            expect(prediction.details).toBeInstanceOf(Array);
            expect(prediction.details.some(detail => detail.includes('Recommendations'))).toBe(true);
            expect(prediction.details.length).toBeGreaterThan(1);
        });

        it('should maintain consistent tensor count after predictions', async () => {
            const initialTensors = tf.memory().numTensors;
            const features = new Array(20).fill(0).map(() => Math.random());
            
            await model.predict(features);
            
            expect(tf.memory().numTensors).toBe(initialTensors);
        });

        it('should gracefully handle invalid feature dimensions', async () => {
            const invalidFeatures = new Array(10).fill(0); // Wrong size
            await expect(model.predict(invalidFeatures)).rejects.toThrow();
        });
    });

    describe('model persistence', () => {
        // Test comprehensive model persistence
        it('should save and load model with validation', async () => {
            const tempDir = './test-models';
            const modelPath = `${tempDir}/model`;

            // Train model
            const trainData = generateTrainingData(5);
            await model.train(trainData);

            // Save model
            await model.save(modelPath);

            // Load model and verify state
            await model.load(modelPath);

            // Verify prediction works after load
            const testFeatures = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predict(testFeatures);
            expect(prediction.type).toBeDefined();
            expect(prediction.confidence).toBeGreaterThan(0);
        });

        // Test stress scenarios
        it('should handle concurrent operations', async () => {
            const trainData = generateTrainingData(5);
            await model.train(trainData);

            // Run concurrent predictions
            const promises = Array(10).fill(0).map(async () => {
                const features = new Array(20).fill(0).map(() => Math.random());
                return model.predict(features);
            });

            const results = await Promise.all(promises);
            results.forEach(result => {
                expect(result.type).toBeDefined();
                expect(result.confidence).toBeGreaterThan(0);
            });
        });

        // Test error recovery
        it('should recover from errors and maintain state', async () => {
            // Train initial model
            const trainData = generateTrainingData(5);
            await model.train(trainData);

            // Force an error
            try {
                await model.predict([]);
            } catch (error) {
                if (error instanceof Error) {
                    expect(error.message).toContain('Invalid features array');
                } else {
                    fail('Expected an Error but got something else');
                }
            }

            // Verify model still works
            const validFeatures = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predict(validFeatures);
            expect(prediction.type).toBeDefined();
        });

        // Test cleanup effectiveness
        it('should cleanup resources properly', async () => {
            const initialTensors = tf.memory().numTensors;

            // Train and make predictions
            const trainData = generateTrainingData(5);
            await model.train(trainData);
            
            const features = new Array(20).fill(0).map(() => Math.random());
            await model.predict(features);

            // Cleanup
            await model.cleanup();

            // Verify tensor cleanup
            expect(tf.memory().numTensors).toBeLessThanOrEqual(initialTensors);
        });
    });
});
