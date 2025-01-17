import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityDetectionModel } from '../ml-model.js';
import { VulnerabilityType } from '../types.js';

const createMockModel = () => ({
    add: jest.fn(),
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({ 
        history: { 
            loss: [0.1],
            acc: [0.9]
        }
    }),
    predict: jest.fn(() => ({
        data: jest.fn().mockResolvedValue(new Float32Array([0.8, 0.1, 0.1])),
        dataSync: jest.fn().mockReturnValue([0]),
        dispose: jest.fn()
    })),
    dispose: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined)
});

const mockModel = createMockModel();

const mockTf = {
    sequential: jest.fn().mockReturnValue(mockModel),
    layers: {
        dense: jest.fn().mockReturnValue({
            apply: jest.fn()
        }),
        dropout: jest.fn().mockReturnValue({
            apply: jest.fn()
        })
    },
    train: {
        adam: jest.fn().mockReturnValue({
            getConfig: jest.fn().mockReturnValue({ learningRate: 0.001 })
        })
    },
    tensor2d: jest.fn(() => ({
        dispose: jest.fn()
    })),
    tensor1d: jest.fn(() => ({
        dispose: jest.fn()
    })),
    oneHot: jest.fn(() => ({
        dispose: jest.fn()
    })),
    dispose: jest.fn(),
    loadLayersModel: jest.fn().mockResolvedValue(mockModel),
    tidy: jest.fn((fn: () => any) => fn())
};

jest.mock('@tensorflow/tfjs-node', () => mockTf);

describe('VulnerabilityDetectionModel', () => {
    let model: VulnerabilityDetectionModel;
    
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset sequential mock to return new model for each test
        mockTf.sequential.mockReturnValue(createMockModel());
        model = new VulnerabilityDetectionModel();
    });

    afterEach(async () => {
        if (model) {
            await model.cleanup();
        }
        jest.clearAllMocks();
    });

    const testData = [
        {
            features: Array.from({length: 20}, () => Math.random()),
            vulnerabilityType: VulnerabilityType.Reentrancy
        },
        {
            features: Array.from({length: 20}, () => Math.random()),
            vulnerabilityType: VulnerabilityType.AccessControl
        }
    ] as { features: number[]; vulnerabilityType: VulnerabilityType }[];

    it('should train without errors', async () => {
        const trainingData = testData.map(d => ({...d}));
        const result = await model.train(
            trainingData.map(d => ({
                features: d.features,
                label: d.vulnerabilityType
            }))
        );
        expect(result.loss).toBeDefined();
        expect(result.loss).toBeLessThan(1);
        expect(mockModel.fit).toHaveBeenCalled();
    });

    it('should handle empty training data', async () => {
        await expect(model.train([])).rejects.toThrow('Training data cannot be empty');
    });

    describe('predict', () => {
        it('should return valid prediction structure', async () => {
            const features = Array.from({length: 20}, () => Math.random());
            const prediction = await model.predict(features);
            
            expect(prediction).toHaveProperty('type');
            expect(prediction).toHaveProperty('confidence');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(Object.values(VulnerabilityType)).toContain(prediction.type);
            expect(typeof prediction.confidence).toBe('number');
        });

        it('should handle invalid input features', async () => {
            await expect(model.predict([])).rejects.toThrow('Invalid input: expected 20 features');
            await expect(model.predict(Array(19).fill(0))).rejects.toThrow('Invalid input: expected 20 features');
        });
    });

    describe('save/load', () => {
        const testPath = './test-model';

        it('should save and load model without errors', async () => {
            await model.save(testPath);
            await expect(model.load(testPath)).resolves.not.toThrow();
        });

        it('should handle invalid save path', async () => {
            await expect(model.save('')).rejects.toThrow('Invalid save path specified');
        });

        it('should handle invalid load path', async () => {
            mockTf.loadLayersModel.mockRejectedValueOnce(new Error('File not found'));
            await expect(model.load('invalid-path')).rejects.toThrow('Failed to load model');
        });
    });

    describe('cleanup', () => {
        it('should dispose of model resources', async () => {
            await model.cleanup();
            expect(mockModel.dispose).toHaveBeenCalled();
        });
    });
});
