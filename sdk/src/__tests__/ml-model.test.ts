import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { VulnerabilityDetector } from '../ai/src/vulnerability-detection-model.js';
import { VulnerabilityType } from '../types.js';

// Create a simple mock for TensorFlow
jest.mock('@tensorflow/tfjs-node', () => ({
    sequential: jest.fn(() => ({
        add: jest.fn(),
        compile: jest.fn(),
        predict: jest.fn().mockReturnValue({
            array: () => Promise.resolve([[0.1, 0.2, 0.7]]),
            dispose: jest.fn()
        }),
        save: jest.fn(),
        dispose: jest.fn()
    })),
    layers: {
        dense: jest.fn().mockReturnValue({
            apply: jest.fn()
        }),
        dropout: jest.fn().mockReturnValue({
            apply: jest.fn()
        })
    },
    train: {
        adam: jest.fn()
    },
    tensor2d: jest.fn().mockReturnValue({
        dispose: jest.fn()
    }),
    loadLayersModel: jest.fn().mockImplementation(async () => ({
        predict: jest.fn().mockReturnValue({
            array: () => Promise.resolve([[0.1, 0.2, 0.7]]),
            dispose: jest.fn()
        })
    }))
}));

describe('VulnerabilityDetector Tests', () => {
    let model: VulnerabilityDetector;
    const mockModelPath = '/tmp/test-model';
    const mockConfig = {
        inputShape: [100],
        hiddenLayers: [64, 32],
        learningRate: 0.001,
        batchSize: 32,
        epochs: 10
    };

    beforeEach(() => {
        model = new VulnerabilityDetector(mockConfig);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should initialize correctly', () => {
        expect(model).toBeDefined();
    });

    it('should predict vulnerabilities', async () => {
        await model.ensureInitialized();
        const features = [[1, 2, 3, 4, 5]];
        const result = await model.predict(features);
        
        expect(result).toBeDefined();
        expect(result.vulnerabilityType).toBeDefined();
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.modelVersion).toBe('1.0.0');
        expect(typeof result.timestamp).toBe('number');
    });

    it('should save and load model', async () => {
        await model.ensureInitialized();
        await model.save(mockModelPath);
        await model.load(mockModelPath);
        expect(model['initialized']).toBe(true);
    });
});
