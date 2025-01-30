import { jest } from '@jest/globals';
import { Rank, ShapeMap, Tensor, KernelBackend } from '@tensorflow/tfjs-core';

const createMockTensorInstance = () => ({
  shape: [1],
  dtype: 'float32',
  size: 1,
  data: async () => new Float32Array(1),
  dataSync: () => new Float32Array(1),
  dispose: () => {},
  array: async () => [0],
  arraySync: () => [0],
  print: () => {},
  reshape: function(newShape: number[]) { 
    const instance = createMockTensorInstance();
    instance.shape = newShape;
    return instance;
  },
  cast: function(dtype: string) {
    const instance = createMockTensorInstance();
    instance.dtype = dtype;
    return instance;
  },
  clone: function() { return createMockTensorInstance(); },
  val: async () => new Float32Array(1),
  buffer: async () => ({ shape: [1], dtype: 'float32', size: 1, values: new Float32Array(1) }),
  expandDims: function() { return createMockTensorInstance(); }
});

// Mock TensorFlow
const tf = {

  sequential: jest.fn().mockReturnValue({
    add: jest.fn().mockReturnThis(),
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({}),
    predict: jest.fn().mockReturnValue({
      data: () => Promise.resolve(new Float32Array([0.5])),
      dispose: jest.fn()
    }),
    dispose: jest.fn(),
    layers: [],
    getWeights: jest.fn().mockReturnValue([]),
    setWeights: jest.fn()
  }),
  layers: {
    dense: jest.fn().mockImplementation((config) => ({
      apply: jest.fn(),
      getWeights: jest.fn().mockReturnValue([]),
      setWeights: jest.fn(),
      units: config.units,
      activation: config.activation,
      kernelInitializer: config.kernelInitializer,
      getConfig: () => config,
      name: 'dense'
    }))
  },
  ready: jest.fn().mockResolvedValue(undefined),
  getBackend: jest.fn().mockReturnValue('cpu'),
  setBackend: jest.fn().mockResolvedValue(true),
  env: jest.fn().mockReturnValue({ flags: {}, platform: 'node' }),
  tensor2d: jest.fn().mockReturnValue({
    dispose: jest.fn(),
    data: () => Promise.resolve(new Float32Array([0.5])),
    arraySync: () => [[0.5]],
    reshape: jest.fn().mockReturnThis()
  }),
  train: {
    adam: jest.fn().mockReturnValue({
      minimize: jest.fn()
    })
  },
  tensor: jest.fn().mockReturnValue({
    dispose: jest.fn(),
    data: () => Promise.resolve(new Float32Array([0.5])),
    arraySync: () => [[0.5]],
    reshape: jest.fn().mockReturnThis()
  }),
  disposeVariables: jest.fn(),
  backend: jest.fn().mockReturnValue({
    dispose: () => true,
    disposeData: () => true,
    read: async () => new Float32Array(),
    readSync: () => new Float32Array(),
    readToGPU: () => ({
      texture: undefined,
      texShape: [1, 1],
      tensorRef: createMockTensorInstance(),
      buffer: {
        __brand: 'GPUBuffer',
        size: 4,
        usage: 0,
        mapState: 'unmapped',
        getMappedRange: () => new ArrayBuffer(4),
        unmap: () => {},
        destroy: () => {},
        label: '',
        onSubmittedWorkDone: () => Promise.resolve(undefined),
        mapAsync: () => Promise.resolve(undefined),
        getBindGroupLayout: () => ({})
      }
    }),
    numDataIds: () => 0,
    createTensorFromGPUData: () => createMockTensorInstance(),
    write: () => ({}),
    memory: () => ({ unreliable: false, reasons: [] }),
    refCount: () => 0,
    incRef: () => {},
    timerAvailable: () => true,
    time: () => Promise.resolve({ kernelMs: 0, wallMs: 0 }),
    getTexture: () => null,
    getDataSubset: () => new Float32Array(),
    makeTensorInfo: (shape: number[], dtype: string) => ({ dataId: {}, shape, dtype }),
    move: () => {},
    fromPixels: () => createMockTensorInstance()
  }),
  randomNormal: jest.fn().mockImplementation(() => createMockTensorInstance()),
  loadLayersModel: jest.fn().mockResolvedValue({
    layers: [
      {
        getClassName: jest.fn().mockReturnValue('Dense'),
        inputShape: [10],
        outputShape: [10],
        apply: jest.fn().mockImplementation(() => createMockTensorInstance())
      }
    ],
    predict: jest.fn().mockImplementation(() => createMockTensorInstance()),
    dispose: jest.fn()
  }),
  losses: {
    meanSquaredError: jest.fn().mockImplementation(() => createMockTensorInstance())
  },
  buffer: jest.fn().mockReturnValue({
    shape: [1],
    dtype: 'float32',
    size: 1,
    values: new Float32Array(1)
  })
};

// Export the mock TensorFlow instance
export default tf;


