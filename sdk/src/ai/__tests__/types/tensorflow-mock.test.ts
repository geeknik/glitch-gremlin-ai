import { describe, test, expect } from '@jest/globals';

const mockTf = {
  sequential: jest.fn(() => ({
    add: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnThis(),
    predict: jest.fn().mockResolvedValue([[0]]),
    summary: jest.fn(),
    dispose: jest.fn(),
    getWeights: jest.fn().mockReturnValue([]),
    setWeights: jest.fn(),
    trainOnBatch: jest.fn().mockResolvedValue(0),
    fit: jest.fn().mockResolvedValue({}),
    evaluate: jest.fn().mockResolvedValue([0, 0]),
    save: jest.fn().mockResolvedValue({}),
    loadLayersModel: jest.fn().mockResolvedValue({}),
    layers: [],
    optimizer: {},
    name: 'mocked-model'
  })),
  layers: {
    dense: jest.fn((config: any) => ({
      config,
      apply: jest.fn().mockReturnValue([[0]]),
      getConfig: jest.fn().mockReturnValue(config)
    }))
  },
  train: {
    adam: jest.fn().mockImplementation((learningRate: number) => ({
      learningRate,
      getConfig: jest.fn().mockReturnValue({learningRate})
    }))
  },
  tensor: jest.fn(),
  tensor2d: jest.fn(),
  model: jest.fn(),
  ready: jest.fn().mockResolvedValue(undefined),
  dispose: jest.fn(),
  backend: jest.fn(() => 'cpu'),
  memory: jest.fn(() => ({ numTensors: 0, numDataBuffers: 0, numBytes: 0 }))
};

describe('TensorFlow Mock', () => {
  test('should have all required mock functions', () => {
    expect(mockTf).toBeDefined();
    expect(mockTf.sequential).toBeDefined();
    expect(mockTf.layers.dense).toBeDefined();
    expect(mockTf.train.adam).toBeDefined();
    expect(mockTf.tensor).toBeDefined();
    expect(mockTf.tensor2d).toBeDefined();
    expect(mockTf.model).toBeDefined();
    expect(mockTf.ready).toBeDefined();
    expect(mockTf.dispose).toBeDefined();
    expect(mockTf.backend).toBeDefined();
    expect(mockTf.memory).toBeDefined();
  });
});
