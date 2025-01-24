import * as tf from '@tensorflow/tfjs-node';

const createSequentialModel = (): tf.Sequential => {
  const model = {
    add: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnThis(),
    predict: jest.fn().mockReturnValue({
      dataSync: jest.fn().mockReturnValue(new Float32Array([0.1, 0.2, 0.3])),
      array: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      dispose: jest.fn()
    }),
    fit: jest.fn().mockResolvedValue({ 
      history: { 
        loss: [0.1],
        accuracy: [0.9]
      }
    }),
    save: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
    getWeights: jest.fn().mockReturnValue([{
      dataSync: () => new Float32Array(10),
      dispose: jest.fn()
    }]),
    setWeights: jest.fn(),
    summary: jest.fn(),
    // Add required Sequential properties
    model: {
      layers: [],
      optimizer: {},
      metricsNames: [],
      metricsTensors: []
    },
    checkShape: jest.fn(),
    pop: jest.fn(),
    call: jest.fn(),
    countParams: jest.fn().mockReturnValue(0),
    evaluate: jest.fn().mockResolvedValue([0]),
    evaluateDataset: jest.fn().mockResolvedValue([0]),
    getConfig: jest.fn().mockReturnValue({}),
    getLayer: jest.fn(),
    getLossesFor: jest.fn().mockReturnValue([]),
    getUpdatesFor: jest.fn().mockReturnValue([]),
    loadWeights: jest.fn().mockResolvedValue(undefined),
    trainable: true,
    name: 'mock-sequential-model',
    inputs: [],
    outputs: []
  };

  return model as unknown as tf.Sequential;
};

const mockTF: any = {
  sequential: jest.fn().mockImplementation(() => createSequentialModel()),
  layers: {
    dense: jest.fn().mockReturnValue({
      apply: jest.fn(),
      getWeights: jest.fn().mockReturnValue([]),
      setWeights: jest.fn()
    }),
    dropout: jest.fn().mockReturnValue({
      apply: jest.fn()
    })
  },
  train: {
    adam: jest.fn().mockReturnValue({
      apply: jest.fn(),
      minimize: jest.fn()
    })
  },
  tensor: jest.fn((values) => ({
    dataSync: jest.fn().mockReturnValue(new Float32Array(values)),
    dispose: jest.fn(),
    reshape: jest.fn().mockReturnThis(),
    mul: jest.fn().mockReturnThis(),
    add: jest.fn().mockReturnThis(),
    sub: jest.fn().mockReturnThis(),
    array: jest.fn().mockResolvedValue(values),
    arraySync: jest.fn().mockReturnValue(values)
  })),
  tensor2d: jest.fn().mockReturnValue({
    dataSync: jest.fn().mockReturnValue(new Float32Array(10)),
    dispose: jest.fn()
  }),
  concat: jest.fn().mockReturnValue({
    dispose: jest.fn()
  }),
  argMax: jest.fn().mockReturnValue({
    dataSync: jest.fn().mockReturnValue([0]),
    dispose: jest.fn()
  }),
  tidy: jest.fn((fn) => fn()),
  dispose: jest.fn(),
  memory: jest.fn().mockReturnValue({
    numTensors: 0,
    numDataBuffers: 0,
    numBytes: 0
  }),
  loadLayersModel: jest.fn().mockImplementation(() => createSequentialModel())
};

// Cast to unknown first to avoid type errors
export default mockTF as unknown as typeof tf;
export type { Tensor, Sequential } from '@tensorflow/tfjs-node';
