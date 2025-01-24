// Mock must be first!
jest.mock('@tensorflow/tfjs-node', () => {
  const mockTensor = [[0.1]];
  return {
    sequential: jest.fn().mockReturnValue({
      compile: jest.fn(),
      fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
      predict: jest.fn().mockResolvedValue({ 
        array: jest.fn().mockResolvedValue(mockTensor),
        dispose: jest.fn() 
      }),
      save: jest.fn().mockResolvedValue(undefined)
    }),
    tensor: jest.fn().mockReturnValue({
      array: jest.fn().mockResolvedValue(mockTensor),
      dispose: jest.fn()
    }),
    loadLayersModel: jest.fn(),
    tensor2d: jest.fn()
  };
});

import { AnomalyDetector } from '../src/anomaly-detection';
import { jest } from '@jest/globals';
import { TimeSeriesMetric, ModelConfig } from '../src/types';
import tf from '@tensorflow/tfjs-node';

const sampleData: TimeSeriesMetric[] = [
  { 
    timestamp: Date.now() - 2000,
    cpuUtilization: [78],
    instructionFrequency: [0.5],
    executionTime: [100],
    memoryUsage: [2048],
    errorRate: [0.1],
    pdaValidation: [5],
    accountDataMatching: [10],
    cpiSafety: [8],
    authorityChecks: [3],
    type: 'cpu'
  },
  { 
    timestamp: Date.now() - 1000,
    instructionFrequency: [0.6, 0.25, 0.15],
    executionTime: [125, 130, 120],
    memoryUsage: [2048, 3072, 2560],
    cpuUtilization: [82, 85, 80],
    errorRate: [0.15, 0.1, 0.12],
    pdaValidation: [6, 5, 7],
    accountDataMatching: [12, 14, 13],
    cpiSafety: [9, 8, 10],
    authorityChecks: [4, 3, 5],
    type: 'cpu'
  },
  { 
    timestamp: Date.now(),
    instructionFrequency: [0.4, 0.35, 0.25],
    executionTime: [110, 115, 105],
    memoryUsage: [1536, 2048, 1792],
    cpuUtilization: [78, 75, 77],
    errorRate: [0.08, 0.12, 0.1],
    pdaValidation: [7, 6, 8],
    accountDataMatching: [11, 13, 12],
    cpiSafety: [10, 9, 11],
    authorityChecks: [5, 4, 6],
    type: 'cpu'
  }
];

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    // Use fake timers and clear mocks
    jest.useFakeTimers();
    jest.clearAllMocks();
    
    detector = new AnomalyDetector({
      windowSize: 3,
      threshold: 0.8,
      minSampleSize: 3,
      epochs: 1
    }, false); // Skip automatic model initialization
  });

  beforeAll(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should initialize with default config', () => {
    const defaultDetector = new AnomalyDetector();
    expect(defaultDetector).toBeDefined();
  });

  it('should train model with valid data', async () => {
    const mockModel = {
      compile: jest.fn(),
      fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
      predict: jest.fn().mockResolvedValue(tf.tensor([[0.1]])),
      save: jest.fn().mockResolvedValue(undefined)
    };
    (tf.sequential as jest.Mock).mockReturnValue(mockModel);
    (tf.tensor as jest.Mock).mockImplementation((data) => ({
      array: () => Promise.resolve(data),
      dispose: jest.fn()
    }));
    
    // Mock all async operations to resolve immediately
    mockModel.fit.mockResolvedValue({ 
      history: { loss: [0.1] },
      epoch: 1 
    });
    mockModel.predict.mockResolvedValue(tf.tensor([[0.1]]));
    
    await detector.train(sampleData);
    
    expect(mockModel.compile).toHaveBeenCalledWith({
      optimizer: 'adam',
      loss: 'meanSquaredError'
    });
    expect(mockModel.fit).toHaveBeenCalled();
  });

  it('should detect anomalies in time series data', async () => {
    const mockModel = {
      compile: jest.fn(),
      fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
      predict: jest.fn().mockResolvedValue(tf.tensor([[0.1]])),
      save: jest.fn().mockResolvedValue(undefined)
    };
    (tf.sequential as jest.Mock).mockReturnValue(mockModel);
    (tf.tensor as jest.Mock).mockImplementation((data) => ({
      array: () => Promise.resolve(data),
      dispose: jest.fn()
    }));
    mockModel.fit.mockResolvedValue({ history: { loss: [0.1] } });
    mockModel.predict.mockResolvedValue(tf.tensor([[0.1]]));
    
    await detector.train(sampleData);
    
    const testMetric = {
      ...sampleData[0],
      cpuUtilization: [78, 80, 75],
      instructionFrequency: [0.5],
      executionTime: [100],
      memoryUsage: [2048],
      errorRate: [0.1],
      pdaValidation: [5],
      accountDataMatching: [10],
      cpiSafety: [8],
      authorityChecks: [3]
    };
    
    const results = await detector.detect(testMetric);
    
    expect(mockModel.predict).toHaveBeenCalled();
    expect(results.isAnomaly).toBeDefined();
    expect(results).toHaveProperty('confidence');
    expect(results).toHaveProperty('details');
  });

  it('should throw error when detecting without training', async () => {
    jest.setTimeout(30000); // Increase timeout to 30 seconds
    const untrainedDetector = new AnomalyDetector({
      windowSize: 3,
      threshold: 0.8,
      minSampleSize: 3,
      epochs: 1
    });

    // Test with valid data should throw model not initialized
    const validTestMetric = {
      ...sampleData[0],
      cpuUtilization: [75, 80, 85, 82, 78]
    };
    await expect(untrainedDetector.detect(validTestMetric))
      .rejects.toThrow('Model not initialized or trained');

    // Test with invalid data should throw data validation error
    // First train detector with valid data
    await detector.train(sampleData);
    
    // Test with invalid data should throw data validation error
    const invalidTestMetric = { 
      timestamp: Date.now(),
      cpuUtilization: 'not-an-array', // Invalid type
      instructionFrequency: [0.5],
      executionTime: [100],
      memoryUsage: [2048],
      errorRate: [0.1],
      pdaValidation: [5], 
      accountDataMatching: [10],
      cpiSafety: [8],
      authorityChecks: [3],
      type: 'cpu'
    };
    await expect(untrainedDetector.detect(invalidTestMetric))
      .rejects.toThrow('Invalid cpuUtilization format - must be array');
  });

  it('should validate configuration parameters', () => {
    // Test invalid window sizes
    expect(() => new AnomalyDetector({ windowSize: 0 }))
      .toThrow('Window size must be positive');
    
    // Test threshold clamping
    const clampedDetector = new AnomalyDetector({ 
      threshold: -0.5,
      windowSize: 3,
      minSampleSize: 3,
      zScoreThreshold: 2.5  // Add required field
    });
    // Test threshold lower bound clamping
    expect(clampedDetector.config.threshold).toBe(0.01);
    
    // Test threshold upper bound
    const upperBoundDetector = new AnomalyDetector({ 
      threshold: 1.5, 
      windowSize: 3,
      minSampleSize: 3
    });
    expect(upperBoundDetector.config.threshold).toBe(1.0);
    
    // Test invalid learning rate
    expect(() => new AnomalyDetector({ learningRate: -0.1 }))
      .toThrow('Learning rate must be positive');
  });

  it('should handle empty input data', async () => {
    await expect(detector.train([]))
      .rejects.toThrow('Training data cannot be empty');
  });

  it('should handle invalid data structures', async () => {
    // Valid data structure but insufficient samples
    const invalidData = [
      { 
        timestamp: Date.now(),
        instructionFrequency: [0.5],
        executionTime: [100],
        memoryUsage: [2048],
        errorRate: [0.1],
        pdaValidation: [5],
        accountDataMatching: [10],
        cpiSafety: [8],
        authorityChecks: [3],
        type: 'cpu'
      },
      {
        timestamp: Date.now() - 1000,
        instructionFrequency: [0.6],
        executionTime: [120],
        memoryUsage: [3072],
        errorRate: [0.15],
        pdaValidation: [6],
        accountDataMatching: [12],
        cpiSafety: [9],
        authorityChecks: [4],
        type: 'cpu'
      },
      {
        timestamp: Date.now() - 2000,
        // Missing required cpuUtilization field
        instructionFrequency: [0.4],
        executionTime: [110],
        memoryUsage: [1536],
        errorRate: [0.08],
        pdaValidation: [7],
        accountDataMatching: [11],
        cpiSafety: [10],
        authorityChecks: [5],
        type: 'cpu'
      }
    ];

    await expect(detector.train(invalidData))
      .rejects.toThrow('Invalid cpuUtilization format - must be array');
  });

  it('should handle insufficient training data', async () => {
    const smallData = [sampleData[0]]; // Only 1 sample
    await expect(detector.train(smallData))
      .rejects.toThrow('Insufficient training data - need at least 3 samples');
  }, 30000);

  it('should handle model save/load lifecycle', async () => {
    const mockModel = {
      compile: jest.fn(),
      fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
      predict: jest.fn().mockResolvedValue(tf.tensor([[0.1]])),
      save: jest.fn().mockResolvedValue(undefined)
    };
    (tf.sequential as jest.Mock).mockReturnValue(mockModel);
    
    await detector.train(sampleData);
    
    // Mock the TensorFlow save/load operations
    const mockSave = jest.spyOn(mockModel, 'save').mockResolvedValue(undefined);
    const mockLoad = jest.spyOn(tf, 'loadLayersModel').mockResolvedValue(mockModel as any);
    
    await expect(detector.save('./test-model')).resolves.not.toThrow();
    await expect(detector.load('./test-model')).resolves.not.toThrow();

    expect(mockSave).toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalled();
    
    mockSave.mockRestore();
    mockLoad.mockRestore();
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

