import { AnomalyDetector } from '../src/anomaly-detection';
import { jest } from '@jest/globals';
import * as tf from '@tensorflow/tfjs-node';
import { TimeSeriesMetric, ModelConfig } from '../src/types';

// Use global tf mock from jest.setup.ts

const sampleData: TimeSeriesMetric[] = [
  { 
    timestamp: Date.now() - 2000, 
    instructionFrequency: [0.5, 0.3, 0.2], 
    type: 'cpu' 
  },
  { 
    timestamp: Date.now() - 1000, 
    instructionFrequency: [0.6, 0.25, 0.15], 
    type: 'cpu' 
  },
  { 
    timestamp: Date.now(), 
    instructionFrequency: [0.4, 0.35, 0.25], 
    type: 'cpu' 
  }
];

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector({
      windowSize: 3,
      zScoreThreshold: 2.5,
      minSampleSize: 3
    });
  });

  it('should initialize with default config', () => {
    const defaultDetector = new AnomalyDetector();
    expect(defaultDetector).toBeDefined();
  });

  it('should train model with valid data', async () => {
    const spyFit = jest.spyOn(tf.sequential().fit as jest.Mock, 'mockResolvedValue');
    await detector.train(sampleData);
    expect(spyFit).toHaveBeenCalled();
    expect(detector.isTrained()).toBe(true);
  });

  it('should detect anomalies in time series data', async () => {
    await detector.train(sampleData);
    const results = await detector.detect(sampleData);
    
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      isAnomaly: expect.any(Boolean),
      score: expect.any(Number),
      details: expect.any(String)
    });
  });

  it('should throw error when detecting without training', async () => {
    await expect(detector.detect(sampleData))
      .rejects.toThrow('Not enough samples for detection');
  });

  it('should validate configuration parameters', () => {
    expect(() => new AnomalyDetector({ windowSize: 0 }))
      .toThrow('Window size must be positive');
    
    expect(() => new AnomalyDetector({ zScoreThreshold: -1 }))
      .toThrow('Z-score threshold must be positive');
  });

  it('should handle empty input data', async () => {
    await expect(detector.train([]))
      .rejects.toThrow('Training data is empty');
  });

  it('should update model with new configuration', () => {
    const newConfig: Partial<ModelConfig> = {
      windowSize: 5,
      zScoreThreshold: 3.0
    };
    
    // Update config and verify changes
    detector.config = {...detector.config, ...newConfig};
    expect(detector.config.windowSize).toBe(5);
    expect(detector.config.zScoreThreshold).toBe(3.0);
  });
});

