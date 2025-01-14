import { VulnerabilityDetectionModel, VulnerabilityOutput } from '../src/ml-model';
import { VulnerabilityType } from '../src/types';
import * as tf from '@tensorflow/tfjs-node';

interface ModelOutput {
    type: VulnerabilityType;
    confidence: number;
}
describe('VulnerabilityDetectionModel', () => {
    let model: VulnerabilityDetectionModel;
    
    beforeEach(async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        model = new VulnerabilityDetectionModel();
        await model.train(testData.map(d => d.features), testData.map(d => Object.values(VulnerabilityType).indexOf(d.vulnerabilityType)));
    });

    afterEach(async () => {
        try {
            if (model) {
                await model.cleanup();
            }
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
        jest.restoreAllMocks();
    });

describe('buildModel', () => {
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
    await expect(model.train(trainingData.map(d => d.features), trainingData.map(d => Object.values(VulnerabilityType).indexOf(d.vulnerabilityType)))).resolves.not.toThrow();
    });

    it('should handle empty training data', async () => {
    await expect(model.train([], [])).rejects.toThrow();
    });

describe('predict', () => {
    it('should return valid prediction structure', async () => {
        const features: number[] = Array.from({length: 20}, () => Math.random());
        const prediction = await model.predict(features) as ModelOutput;
        
        expect(prediction).toHaveProperty('type');
        expect(prediction).toHaveProperty('confidence');
        expect(prediction.confidence).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
        expect(Object.values(VulnerabilityType)).toContain(prediction.type);
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
