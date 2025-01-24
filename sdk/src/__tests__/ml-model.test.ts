import { jest, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { VulnerabilityDetectionModelImpl as VulnerabilityDetectionModel } from '../ai/src/ml-model';
import { VulnerabilityType } from '../ai/src/types';

// Mock TensorFlow
const mockTF = {
    sequential: jest.fn(),
    layers: {
        dense: jest.fn(),
        dropout: jest.fn()
    },
    memory: jest.fn(() => ({ numTensors: 0 })),
    tidy: jest.fn((fn) => fn()),
    dispose: jest.fn(),
    tensor: jest.fn(),
    tensor2d: jest.fn(),
    keep: jest.fn(x => x),
    metrics: {
        categoricalAccuracy: jest.fn()
    },
    loadLayersModel: jest.fn(),
    oneHot: jest.fn(),
    scalar: jest.fn(),
    tensor1d: jest.fn()
};

jest.mock('@tensorflow/tfjs-node', () => mockTF);

describe('VulnerabilityDetectionModel Tests', () => {
let model: VulnerabilityDetectionModel;
let mockModel: any;

beforeAll(() => {
    // Setup mock model
    mockModel = {
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({ history: { loss: [0.1], accuracy: [0.9] } }),
    predict: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn()
    };
    
    mockTF.sequential.mockReturnValue(mockModel);

    beforeEach(() => {
    // Reset mock states
    jest.clearAllMocks();
    // Create new model instance
    model = new VulnerabilityDetectionModel();
    
    // Setup mock layer outputs
    const mockDenseLayer = { 
        units: 64,
        activation: 'relu',
        apply: jest.fn()
    };
    mockTF.layers.dense.mockReturnValue(mockDenseLayer);
    
    const mockDropoutLayer = {
        rate: 0.2,
        apply: jest.fn() 
    };
    mockTF.layers.dropout.mockReturnValue(mockDropoutLayer);
    });

    afterEach(async () => {
    if (model) {
        await model.cleanup();
    }
    // Verify proper cleanup
    expect(mockModel.dispose).toHaveBeenCalled();
    });

    afterAll(() => {
    // Reset mock states
    jest.resetAllMocks();
    });

    describe('training', () => {

        it('should train on small sample dataset and validate results', async () => {
        // Setup mock data
        const sampleData = generateTrainingData(10);
        const mockTrainTensor = { dispose: jest.fn() };
        mockTF.tensor2d.mockReturnValue(mockTrainTensor);
        
        // Train model
        await model.trainWithData(sampleData);
        
        // Verify model was compiled and trained correctly
        expect(mockModel.compile).toHaveBeenCalledWith({
            optimizer: expect.any(String),
            loss: expect.any(String),
            metrics: expect.arrayContaining(['accuracy'])
        });
        expect(mockModel.fit).toHaveBeenCalled();
        
        // Test prediction 
        const testFeatures = new Array(20).fill(0).map(() => Math.random());
        const mockPredictionTensor = {
            arraySync: jest.fn().mockReturnValue([[0.8, 0.2]]),
            dispose: jest.fn()
        };
        mockModel.predict.mockReturnValue(mockPredictionTensor);
        
        const prediction = await model.predictVulnerability(testFeatures);
        
        // Verify prediction format
        expect(prediction.type).toBeDefined();
        expect(prediction.confidence).toBeGreaterThan(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
        expect(prediction.details).toBeInstanceOf(Array);
        
        // Verify cleanup
        expect(mockTrainTensor.dispose).toHaveBeenCalled();
        expect(mockPredictionTensor.dispose).toHaveBeenCalled();
        });

        it('should handle empty training data gracefully', async () => {
            await expect(model.trainWithData([])).rejects.toThrow('Training data cannot be empty');
        });

        it('should maintain consistent tensor count after training', async () => {
            const initialTensors = tf.memory().numTensors;
            const sampleData = generateTrainingData(5);
            
            await model.trainWithData(sampleData);
            
            // Verify no tensor leaks
            expect(tf.memory().numTensors).toBe(initialTensors);
        });
    });

    describe('predictions', () => {
        beforeEach(async () => {
            // Train the model with minimal dataset before prediction tests
            const sampleData = generateTrainingData(5);
            await model.trainWithData(sampleData);
        });

        it('should detect adversarial inputs', async () => {
            const adversarialFeatures = new Array(100).fill(Number.MAX_VALUE);
            await expect(model.predictVulnerability(adversarialFeatures))
                .rejects.toThrow('Invalid feature values');
            
            const nanFeatures = new Array(100).fill(NaN);
            await expect(model.predictVulnerability(nanFeatures))
                .rejects.toThrow('Invalid feature values');
        });

        it('should make predictions with proper confidence scores', async () => {
            const features = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predictVulnerability(features);

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
            const zeroPrediction = await model.predictVulnerability(zeroFeatures);
            expect(zeroPrediction.type).toBeDefined();

            // Test with all ones
            const oneFeatures = new Array(20).fill(1);
            const onePrediction = await model.predictVulnerability(oneFeatures);
            expect(onePrediction.type).toBeDefined();
        });

        it('should provide meaningful details for predictions', async () => {
            const features = new Array(20).fill(0).map((_, i) => i === 0 ? 0.9 : 0.1);
            const prediction = await model.predictVulnerability(features);

            expect(prediction.details).toBeInstanceOf(Array);
            expect(prediction.details.some((detail: string) => detail.includes('Recommendations'))).toBe(true);
            expect(prediction.details.length).toBeGreaterThan(1);
        });

        it('should maintain consistent tensor count after predictions', async () => {
            const initialTensors = tf.memory().numTensors;
            const features = new Array(20).fill(0).map(() => Math.random());
            
            await model.predictVulnerability(features);
            
            expect(tf.memory().numTensors).toBe(initialTensors);
        });

        it('should gracefully handle invalid feature dimensions', async () => {
            const invalidFeatures = new Array(10).fill(0); // Wrong size
            await expect(model.predictVulnerability(invalidFeatures)).rejects.toThrow();
        });
    });

    describe('model persistence', () => {
        // Test comprehensive model persistence
        it('should save and load model with validation', async () => {
            const tempDir = './test-models';
            const modelPath = `${tempDir}/model`;

            // Train model
            const trainData = generateTrainingData(5);
            await model.trainWithData(trainData);

            // Save model
            await model.save(modelPath);

            // Load model and verify state
            await model.load(modelPath);

            // Verify prediction works after load
            const testFeatures = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predictVulnerability(testFeatures);
            expect(prediction.type).toBeDefined();
            expect(prediction.confidence).toBeGreaterThan(0);
        });

        // Test stress scenarios
        it('should handle concurrent operations', async () => {
            const trainData = generateTrainingData(5);
            await model.trainWithData(trainData);

            // Run concurrent predictions
            const promises = Array(10).fill(0).map(async () => {
                const features = new Array(20).fill(0).map(() => Math.random());
                return model.predictVulnerability(features);
            });

            const results = await Promise.all(promises);
            results.forEach((result: { type: VulnerabilityType; confidence: number }) => {
                expect(result.type).toBeDefined();
                expect(result.confidence).toBeGreaterThan(0);
            });
        });

        // Test error recovery
        it('should recover from errors and maintain state', async () => {
            // Train initial model
            const trainData = generateTrainingData(5);
            await model.trainWithData(trainData);

            // Force an error
            await expect(model.predictVulnerability([])).rejects.toThrow('Invalid input: expected 20 features');

            // Verify model still works
            const validFeatures = new Array(20).fill(0).map(() => Math.random());
            const prediction = await model.predictVulnerability(validFeatures);
            expect(prediction.type).toBeDefined();
        });

        // Test cleanup effectiveness
        it('should cleanup resources properly', async () => {
            const initialTensors = tf.memory().numTensors;

            // Train and make predictions
            const trainData = generateTrainingData(5);
            await model.trainWithData(trainData);
            
            const features = new Array(20).fill(0).map(() => Math.random());
            await model.predictVulnerability(features);

            // Cleanup
            await model.cleanup();

            // Verify tensor cleanup
            expect(tf.memory().numTensors).toBeLessThanOrEqual(initialTensors);
        });
    });
    });
});
