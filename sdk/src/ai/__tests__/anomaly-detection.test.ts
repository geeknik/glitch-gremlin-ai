import { jest } from '@jest/globals';

// Mock TensorFlow.js
jest.mock('@tensorflow/tfjs-node', () => {
  const mockModelInstance = {
    layers: [],
    add: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnThis(),
    fit: jest.fn().mockResolvedValue({
      history: { loss: [0.1], acc: [0.9] }
    }),
    predict: jest.fn().mockReturnValue({
      dataSync: () => new Float32Array([0.5]),
      arraySync: () => [[0.5]],
      dispose: jest.fn()
    }),
    dispose: jest.fn(),
    summary: jest.fn()
  };

  const mockTensor = {
    dataSync: () => new Float32Array([0.5]),
    dispose: jest.fn(),
    slice: jest.fn().mockReturnValue({
      dataSync: () => new Float32Array([0.5]),
      dispose: jest.fn()
    }),
    shape: [2, 9]
  };

  const tf = {
    layers: {
      dense: jest.fn().mockReturnValue({
        apply: jest.fn(),
        getWeights: jest.fn().mockReturnValue([]),
        setWeights: jest.fn(),
        dispose: jest.fn()
      })
    },
    sequential: jest.fn().mockReturnValue(mockModelInstance),
    tensor2d: jest.fn().mockReturnValue(mockTensor),
    tensor1d: jest.fn().mockReturnValue(mockTensor),
    tidy: jest.fn(fn => fn()),
    train: {
      adam: jest.fn().mockReturnValue({
        minimize: jest.fn(),
        dispose: jest.fn()
      })
    },
    dispose: jest.fn(),
    disposeVariables: jest.fn(),
    setBackend: jest.fn().mockResolvedValue(true),
    ready: jest.fn().mockResolvedValue(undefined),
    moments: jest.fn().mockReturnValue({
      mean: {
        dataSync: () => new Float32Array([0.5]),
        dispose: jest.fn()
      },
      variance: {
        dataSync: () => new Float32Array([0.1]),
        dispose: jest.fn()
      }
    }),
    sqrt: jest.fn().mockReturnValue({
      dataSync: () => new Float32Array([0.316]),
      dispose: jest.fn()
    })
  };

  return tf;
});

import * as tf from '@tensorflow/tfjs-node';
import { AnomalyDetector } from '../src/anomaly-detection';
import type { DetectorConfig, TimeSeriesMetric, AnomalyResult } from '../src/types.js';

// Simplified TensorFlow type declarations for testing
declare module '@tensorflow/tfjs-node' {
  interface Sequential {
    add(layer: any): Sequential;
    compile(config: any): Sequential;
    fit: any;
    predict: any;
    save: any;
    dispose: any;
    summary: any;
  }

  interface Tensor {
    arraySync: () => number[][];
  }
}

const sampleData: TimeSeriesMetric[] = [
  {
    // General metrics
    instructionFrequency: [0.5],
    executionTime: [100],
    memoryUsage: [2048],
    cpuUtilization: [78],
    errorRate: [0.1],
    
    // Solana-specific metrics
    pdaValidation: [5],
    accountDataMatching: [10],
    cpiSafety: [8],
    authorityChecks: [3],
    
    timestamp: Date.now(),
    metadata: { source: 'test' }
  },
  {
    instructionFrequency: [0.6, 0.25, 0.15],
    executionTime: [125, 130, 120],
    memoryUsage: [2048, 3072, 2560],
    cpuUtilization: [82, 85, 80],
    errorRate: [0.15, 0.1, 0.12],
    pdaValidation: [6, 5, 7],
    accountDataMatching: [12, 14, 13],
    cpiSafety: [9, 8, 10],
    authorityChecks: [4, 3, 5],
    timestamp: Date.now() - 1000
  }
];

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  // Close any existing Redis connections before tests
  beforeAll(async () => {
    await AnomalyDetector.closeConnections?.();
  });
  // Robust TensorFlow mock with type safety
  interface MockSequential {
    add: jest.Mock;
    compile: jest.Mock;
    fit: jest.Mock;
    predict: jest.Mock;
    save: jest.Mock;
    dispose: jest.Mock;
    summary: jest.Mock;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Initialize detector with test configuration
    detector = await AnomalyDetector.create({
      windowSize: 32,
      zScoreThreshold: 2.5,
      minSampleSize: 2,
      epochs: 10,
      solanaWeights: {
        pdaValidation: 0.15,
        accountDataMatching: 0.2,
        cpiSafety: 0.25,
        authorityChecks: 0.1
      }
    });
    
    // Initialize model explicitly before each test
    await detector.initializeModel();
  });

  it('should initialize with Solana-specific weights', async () => {
    expect(detector.config.solanaWeights).toEqual({
      pdaValidation: 0.15,
      accountDataMatching: 0.2,
      cpiSafety: 0.25,
      authorityChecks: 0.1
    });

    // Explicitly initialize model for test
    await detector.initializeModel();

    // Verify model initialization
    expect(tf.sequential).toHaveBeenCalled();
    const model = tf.sequential();
    expect(model.add).toHaveBeenCalled();
    expect(model.compile).toHaveBeenCalled();
    // Verify layer creation calls - should match 2 encoder, 1 bottleneck, 2 decoder
    expect(tf.layers.dense).toHaveBeenCalledTimes(5);
    
    expect(tf.layers.dense).toHaveBeenNthCalledWith(1, expect.objectContaining({
      units: 128,
      activation: 'relu',
      inputShape: [9],
      name: 'encoder_1',
      kernelInitializer: 'glorotNormal'
    }));
    expect(tf.layers.dense).toHaveBeenNthCalledWith(3, expect.objectContaining({
      units: 32,
      activation: 'relu',
      name: 'bottleneck'
    }));
    
    // Get the mock model instance
    const mockModelInstance = (tf.sequential as jest.Mock).mock.results[0].value;
    
    // Verify model configuration
    expect(mockModelInstance.add).toHaveBeenCalled();
    expect(mockModelInstance.compile).toHaveBeenCalledWith({
      optimizer: expect.any(tf.AdamOptimizer),
      loss: 'meanSquaredError',
      metrics: ['accuracy']
    });
    
    // Verify optimizer configuration with explicit check
    expect(tf.train.adam).toHaveBeenCalledWith(0.001);
  });

  it('should train model with Solana metrics', async () => {
    await detector.train(sampleData);
    expect(tf.sequential).toHaveBeenCalled();
    const mockSequential = (tf.sequential as jest.Mock).mock.results[0].value;
    expect(mockSequential.fit).toHaveBeenCalled();
  });

  it('should detect anomalies in Solana metrics', async () => {
    await detector.train(sampleData);
    const results = await detector.detect([sampleData[0]]);
    
    expect(results.metricWeights).toEqual(expect.objectContaining({
      pdaValidation: 0.15,
      accountDataMatching: 0.2
    }));
    expect(results.zScores).toHaveProperty('pdaValidation');
    expect(results.zScores).toHaveProperty('accountDataMatching');
  });

  it('should prioritize Solana metrics in anomaly score', async () => {
    const anomalousData: TimeSeriesMetric[] = [{
      ...sampleData[0],
      pdaValidation: [15], // 3x normal
      accountDataMatching: [30], // 3x normal
      instructionFrequency: [0.5],
      executionTime: [100],
      memoryUsage: [2048],
      cpuUtilization: [78],
      errorRate: [0.1],
      cpiSafety: [8],
      authorityChecks: [3],
      timestamp: Date.now(),
      metadata: { source: 'test' }
    }];

    await detector.train(sampleData);
    const results = await detector.detect(anomalousData);
    
    expect(results.isAnomaly).toBe(true);
    expect(results.zScores!.pdaValidation).toBeGreaterThan(2.5);
    expect(results.zScores!.accountDataMatching).toBeGreaterThan(2.5);
  });
});
