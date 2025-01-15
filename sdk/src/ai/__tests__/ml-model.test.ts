import * as tf from '@tensorflow/tfjs-node';
import { VulnerabilityDetectionModel } from '../ml-model';
import { VulnerabilityType } from '../../types';

interface ModelOutput {
    type: VulnerabilityType;
    confidence: number;
}

jest.mock('@tensorflow/tfjs-node', () => ({
    ready: jest.fn().mockResolvedValue(undefined),
    setBackend: jest.fn().mockResolvedValue(undefined),
    disposeVariables: jest.fn(),
    sequential: jest.fn(() => ({
        add: jest.fn(),
        compile: jest.fn(),
        fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
        predict: jest.fn(() => ({
            dataSync: jest.fn(() => new Float32Array([0.1, 0.2, 0.3])),
            dispose: jest.fn()
        }))
    })),
    layers: {
        dense: jest.fn().mockReturnValue({}),
        dropout: jest.fn().mockReturnValue({})
    },
    train: {
        adam: jest.fn()
    },
    tensor2d: jest.fn(() => ({
        dataSync: jest.fn(() => new Float32Array([1, 2, 3])),
        dispose: jest.fn()
    })),
    tensor1d: jest.fn(() => ({
        dataSync: jest.fn(() => new Float32Array([1])),
        dispose: jest.fn()
    })),
    oneHot: jest.fn(() => ({
        dataSync: jest.fn(() => new Float32Array([1, 0, 0])),
        dispose: jest.fn()
    }))
}));
describe('VulnerabilityDetectionModel', () => {
    let model: VulnerabilityDetectionModel;
    
    beforeEach(async () => {
        await tf.ready();
        model = new VulnerabilityDetectionModel();
        await tf.setBackend('cpu');
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await model?.cleanup();
        tf.disposeVariables();
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
        const trainingData = testData.map(d => ({...d})); // Create copy
        const result = await model.train(
            trainingData.map(d => ({
                features: d.features,
                label: d.vulnerabilityType
            }))
        );
        expect(result.loss).toBeDefined();
        expect(result.loss).toBeLessThan(1);
    });

    it('should handle empty training data', async () => {
    await expect(model.train([], [])).rejects.toThrow();
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
      await expect(model.load('invalid-path')).rejects.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should dispose of model resources', async () => {
      const initialTensors = tf.memory().numTensors;
      await model.cleanup();
      expect(tf.memory().numTensors).toBeLessThan(initialTensors);
    });
  });
});
