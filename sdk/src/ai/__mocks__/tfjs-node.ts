import type { Sequential, LayersModel } from '@tensorflow/tfjs-layers';
import type { Tensor, Tensor1D, Tensor2D, BackendValues } from '@tensorflow/tfjs-core';

// Create a reusable mock tensor instance to avoid recursion
const mockTensorInstance = {
  dataSync: jest.fn().mockReturnValue(new Float32Array([0.1, 0.2])),
  dispose: jest.fn(),
  slice: jest.fn(),
  shape: [2, 9],
  reshape: jest.fn().mockReturnThis(),
  mean: jest.fn().mockReturnThis(),
  sub: jest.fn().mockReturnThis(),
  square: jest.fn().mockReturnThis()
};

const createMockTensor = () => {
  mockTensorInstance.dataSync.mockReturnValue(new Float32Array([0.1, 0.2]));
  mockTensorInstance.dispose.mockReset();
  mockTensorInstance.slice.mockReturnValue(mockTensorInstance);
  return mockTensorInstance;
};

const createMockSequential = (): Partial<Sequential> => {
  const mockModel = {
    add: jest.fn().mockImplementation(function(this: any, layer: any) {
      if (!this.layers) {
        this.layers = [];
      }
      this.layers.push(layer);
      return this;
    }),
    compile: jest.fn().mockImplementation(function(this: any) {
      return this;
    }),
    fit: jest.fn().mockResolvedValue({
      history: { loss: [0.1], val_loss: [0.2] }
    }),
    predict: jest.fn().mockImplementation(() => createMockTensor()),
    dispose: jest.fn(),
    summary: jest.fn(),
    layers: [],
    getWeights: jest.fn().mockReturnValue([]),
    setWeights: jest.fn(),
    evaluate: jest.fn().mockResolvedValue([0.1, 0.9])
  };
  return mockModel;
};

const mockLayersModel = {
  layers: [
    {
      getClassName: jest.fn().mockReturnValue('Dense'),
      inputShape: [10],
      outputShape: [10],
      apply: jest.fn().mockReturnValue(createMockTensor())
    }
  ],
  predict: jest.fn().mockReturnValue(createMockTensor()),
  dispose: jest.fn()
} as unknown as LayersModel;

// Main TensorFlow mock object
const mockTf = {
  ready: jest.fn().mockResolvedValue(true),
  setBackend: jest.fn().mockResolvedValue(true),
  sequential: jest.fn().mockImplementation(() => createMockSequential()),
  layers: {
    dense: jest.fn((config) => ({
      ...config,
      getConfig: () => config,
      apply: jest.fn().mockReturnValue(createMockTensor())
    })),
    dropout: jest.fn((config) => ({
      ...config,
      getConfig: () => config,
      apply: jest.fn().mockReturnValue(createMockTensor())
    }))
  },
  initializers: {
    glorotNormal: jest.fn((config) => ({
      apply: jest.fn().mockReturnValue(createMockTensor())
    }))
  },
  tensor2d: jest.fn(() => createMockTensor()),
  tensor1d: jest.fn(() => createMockTensor()),
  tidy: jest.fn((fn) => fn()),
  dispose: jest.fn(),
  memory: jest.fn(() => ({ numTensors: 0 })),
  moments: jest.fn(() => ({ mean: createMockTensor(), variance: createMockTensor() })),
  train: {
    adam: jest.fn().mockReturnValue({
      minimize: jest.fn()
    })
  },
  util: {
    isNullOrUndefined: jest.fn((x) => x === null || x === undefined)
  },
  engine: jest.fn().mockReturnValue({
    disposeVariables: jest.fn(),
    memory: jest.fn(() => ({ numTensors: 0, numBytes: 0, numDataBuffers: 0 }))
  }),
  slice: jest.fn().mockReturnValue(createMockTensor()),
  slice1d: jest.fn().mockReturnValue(createMockTensor()),
  backend: {
    slice: jest.fn().mockReturnValue(createMockTensor()),
    slice1d: jest.fn().mockReturnValue(createMockTensor())
  }
};

// Export both named exports and default export
module.exports = {
  ...mockTf,
  __esModule: true,
  default: mockTf
};

// Export individual functions to match the module's exports
export const ready = mockTf.ready;
export const sequential = mockTf.sequential;
export const layers = mockTf.layers;
export const train = mockTf.train;
export const tensor2d = mockTf.tensor2d;
export const dispose = mockTf.dispose;
export const tidy = mockTf.tidy;
export const moments = mockTf.moments;
export const sqrt = jest.fn(() => createMockTensor());
export const tensor1d = mockTf.tensor1d;
export const getBackend = jest.fn().mockReturnValue('tensorflow');
export const setBackend = mockTf.setBackend;
export const env = {
  memory: jest.fn(() => ({ numTensors: 0, numBytes: 0, numDataBuffers: 0 }))
};
export const loadLayersModel = jest.fn().mockImplementation(() => createMockSequential());
export const initializers = mockTf.initializers;
export const util = {
  isNullOrUndefined: jest.fn((x) => x === null || x === undefined)
};
export const engine = jest.fn().mockReturnValue({
  disposeVariables: jest.fn(),
  memory: jest.fn(() => ({ numTensors: 0, numBytes: 0, numDataBuffers: 0 }))
});
export const slice = mockTf.slice;
export const slice1d = mockTf.slice1d;
export const backend = mockTf.backend;