import { jest } from '@jest/globals';

const createMockLayer = (config: any) => ({
  config,
  apply: jest.fn().mockReturnValue([[0]]),
  getConfig: jest.fn().mockReturnValue(config)
});

const createMockModel = () => {
  const layers: any[] = [];
  const model = {
    add: jest.fn(function(this: any, layer: any) {
      layers.push(layer);
      return this;
    }),
    compile: jest.fn(function(this: any) {
      return this;
    }),
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
    layers,
    optimizer: {},
    name: 'mocked-model'
  };
  return model;
};

const mockModel = createMockModel();

export default {
  sequential: jest.fn(() => createMockModel()),
  layers: {
    dense: jest.fn((config: any) => createMockLayer(config))
  },
  train: {
    adam: jest.fn().mockImplementation((learningRate: number) => ({
      learningRate,
      getConfig: jest.fn().mockReturnValue({learningRate})
    }))
  },
  tensor2d: jest.fn(),
  Tensor: jest.fn(),
  tidy: jest.fn(),
  dispose: jest.fn(),
  backend: () => 'cpu',
  ready: jest.fn().mockResolvedValue(undefined),
  setBackend: jest.fn(),
  memory: () => ({ numTensors: 0, numDataBuffers: 0, numBytes: 0 }),
  ENV: {
    set: jest.fn(),
    get: jest.fn()
  },
  version: {
    'tfjs-core': '3.0.0',
    'tfjs-backend-cpu': '3.0.0', 
    'tfjs-backend-webgl': '3.0.0'
  },
  engine: () => ({
    startScope: jest.fn(),
    endScope: jest.fn(),
    memory: () => ({ numTensors: 0, numDataBuffers: 0, numBytes: 0 }),
    backend: {
      dataSync: jest.fn(),
      dispose: jest.fn()
    }
  }),
  tensor: jest.fn(),
  scalar: jest.fn(),
  zeros: jest.fn(),
  ones: jest.fn(),
  randomNormal: jest.fn(),
  losses: {
    meanSquaredError: jest.fn()
  },
  metrics: {
    meanSquaredError: jest.fn()
  },
  io: {
    withSaveHandler: jest.fn(),
    withLoadHandler: jest.fn()
  }
};
