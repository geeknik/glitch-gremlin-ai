import { VulnerabilityDetectionModel } from './ml-model';
import { VulnerabilityType } from '../types';
import * as tf from '@tensorflow/tfjs-node';

describe('VulnerabilityDetectionModel', () => {
  let model: VulnerabilityDetectionModel;

  beforeEach(() => {
    model = new VulnerabilityDetectionModel();
  });

  afterEach(async () => {
    await model.cleanup();
  });

  describe('buildModel', () => {
    it('should create a valid model architecture', () => {
      const builtModel = model['buildModel']();
      expect(builtModel).toBeInstanceOf(tf.LayersModel);
      expect(builtModel.inputs.length).toBe(1);
      expect(builtModel.outputs.length).toBe(1);
    });
  });

  describe('train', () => {
    it('should train without errors', async () => {
      const trainingData = [
        { 
          features: Array.from({length: 20}, () => Math.random()), 
          vulnerabilityType: VulnerabilityType.Reentrancy 
        },
        { 
          features: Array.from({length: 20}, () => Math.random()),
          vulnerabilityType: VulnerabilityType.AccessControl 
        }
      ];
      
      await expect(model.train(trainingData)).resolves.not.toThrow();
    });

    it('should handle empty training data', async () => {
      await expect(model.train([])).rejects.toThrow();
    });
  });

  describe('predict', () => {
    it('should return valid prediction structure', async () => {
      const features = Array.from({length: 20}, () => Math.random());
      const prediction = await model.predict(features);
      
      expect(prediction).toHaveProperty('type');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle invalid input features', async () => {
      await expect(model.predict([])).rejects.toThrow('Invalid features array provided');
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