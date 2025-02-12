import { jest } from '@jest/globals';

export interface Layer {
  apply: jest.Mock;
  getConfig: () => any;
  name: string;
  getClassName: () => string;
}

export interface Sequential {
  compile: jest.Mock;
  fit: jest.Mock;
  predict: (input: Tensor) => Tensor;
  save: jest.Mock;
  dispose: jest.Mock;
  summary: jest.Mock;
  add: (layer: Layer) => Sequential;
  layers: Layer[];
}

export interface Tensor {
  shape: number[];
  dataSync: () => Float32Array;
  dispose: jest.Mock;
  data: () => Promise<Float32Array>;
  arraySync: () => number[][];
  slice: jest.Mock;
}

// Create tensor mock
const createTensorMock = (shape: number[], data?: number[]): Tensor => ({
  shape,
  dataSync: () => new Float32Array(data || Array(shape.reduce((a, b) => a * b)).fill(0.5)),
  dispose: jest.fn(),
  data: () => Promise.resolve(new Float32Array(data || Array(shape.reduce((a, b) => a * b)).fill(0.5))),
  arraySync: () => Array(shape[0]).fill(Array(shape[1]).fill(0.5)),
  slice: jest.fn(() => createTensorMock([1, 1]))
});

// Create layer mock
const createLayerMock = (name: string, config: any): Layer => ({
  apply: jest.fn(),
  getConfig: () => config,
  name,
  getClassName: () => name.charAt(0).toUpperCase() + name.slice(1)
});

// Create sequential mock
const createSequentialMock = (): Sequential => {
  const layersList: Layer[] = [];
  const sequential = {
    compile: jest.fn().mockReturnThis(),
    fit: jest.fn(() => Promise.resolve({ 
      history: { 
        loss: [0.1, 0.08],
        val_loss: [0.2, 0.15],
        metrics: ['accuracy'] 
      } 
    })),
    predict: jest.fn().mockImplementation((input: Tensor) => {
      // Validate input shape matches first layer's input shape
      if (layersList.length > 0 && input.shape[1] !== layersList[0].getConfig().inputShape?.[0]) {
        throw new Error('Input shape mismatch');
      }
      return createTensorMock([1, 1]);
    }),
    save: jest.fn(() => Promise.resolve()),
    dispose: jest.fn(),
    summary: jest.fn(),
    add(layer: Layer) {
      layersList.push(layer);
      return this;
    },
    layers: layersList
  };
  return sequential;
};

export interface TensorFlowMock {
  ready: jest.Mock;
  getBackend: jest.Mock;
  setBackend: jest.Mock;
  disposeVariables: jest.Mock;
  tidy: jest.Mock;
  dispose: jest.Mock;
  moments: jest.Mock;
  sequential: () => Sequential;
  randomNormal: (shape: number[]) => Tensor;
  tensor2d: (data: any, shape?: number[]) => Tensor;
  loadLayersModel: jest.Mock;
  train: {
    adam: jest.Mock;
  };
  layers: {
    dense: (config: any) => Layer;
    dropout: (config: any) => Layer;
    lstm: (config: any) => Layer;
  };
}

export const setupTensorFlowMocks = (): TensorFlowMock => {
  const ready = jest.fn(() => Promise.resolve()) as jest.Mock;
  ready.mockResolvedValue = jest.fn((val: any) => {
    ready.mockImplementation(() => Promise.resolve(val));
    return ready;
  });

  const tf: TensorFlowMock = {
    ready,
    getBackend: jest.fn(() => 'cpu'),
    setBackend: jest.fn(() => Promise.resolve(true)),
    disposeVariables: jest.fn(),
    tidy: jest.fn((fn: any) => fn()),
    dispose: jest.fn(),
    moments: jest.fn(() => ({
      mean: createTensorMock([1, 1], [0.5]),
      variance: createTensorMock([1, 1], [0.25])
    })),
    sequential: jest.fn(createSequentialMock),
    randomNormal: jest.fn((shape: number[]) => createTensorMock(shape)),
    tensor2d: jest.fn((data: any, shape?: number[]) => {
      if (!shape && Array.isArray(data)) {
        shape = [Array.isArray(data) ? data.length : 1, Array.isArray(data[0]) ? data[0].length : 1];
      }
      return createTensorMock(shape || [1, 1], Array.isArray(data) ? data.flat() : [data]);
    }),
    loadLayersModel: jest.fn(() => Promise.resolve(createSequentialMock())),
    train: {
      adam: jest.fn(() => ({}))
    },
    layers: {
      dense: jest.fn((config: any) => createLayerMock('dense', config)),
      dropout: jest.fn((config: any) => createLayerMock('dropout', config)),
      lstm: jest.fn((config: any) => createLayerMock('lstm', config))
    }
  };

  return tf;
};

describe('setupTensorFlowMocks', () => {
  let tf: TensorFlowMock;

  beforeEach(() => {
    tf = setupTensorFlowMocks();
  });

  it('should create a sequential model', () => {
    const model = tf.sequential();
    expect(model).toBeDefined();
    expect(model.compile).toBeDefined();
    expect(model.fit).toBeDefined();
    expect(model.predict).toBeDefined();
  });

  it('should create dense layers', () => {
    const layer = tf.layers.dense({ units: 32 });
    expect(layer).toBeDefined();
    expect(layer.getConfig().units).toBe(32);
    expect(layer.apply).toBeDefined();
  });

  it('should create tensors', () => {
    const tensor = tf.tensor2d([[1, 2], [3, 4]]);
    expect(tensor).toBeDefined();
    expect(tensor.shape).toEqual([2, 2]);
    expect(tensor.dataSync()).toBeInstanceOf(Float32Array);
  });
});
