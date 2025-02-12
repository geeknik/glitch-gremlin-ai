export interface TensorFlowMock {
  sequential: jest.Mock;
  layers: {
    dense: jest.Mock;
  };
  train: {
    adam: jest.Mock;
  };
  tensor: jest.Mock;
  tensor2d: jest.Mock;
  model: jest.Mock;
  ready: jest.Mock;
  dispose: jest.Mock;
  backend: jest.Mock;
  memory: jest.Mock;
}

export const mockTensorFlow: TensorFlowMock = {
    sequential: () => ({
        add: jest.fn(),
        compile: jest.fn(),
        predict: jest.fn(() => ({
            argMax: () => ({ 
                dataSync: () => [Math.floor(Math.random() * 32)] 
            })
        })),
        dispose: jest.fn(),
        setWeights: jest.fn(),
        getWeights: jest.fn(() => [])
    }),
    layers: {
        dense: (config: any) => ({
            ...config,
            apply: jest.fn()
        })
    },
    train: {
        adam: (lr: number) => ({})
    },
    tensor2d: (data: any, shape: any) => [],
    tensor1d: (data: any) => [],
    ready: () => Promise.resolve(),
    loadLayersModel: jest.fn(),
    LayersModel: class {
        static save = jest.fn();
        static load = jest.fn();
        setWeights = jest.fn();
        getWeights = jest.fn(() => []);
        predict = jest.fn(() => []);
        dispose = jest.fn();
    }
};

describe('mockTensorFlow', () => {
  it('should create a sequential model', () => {
    const model = mockTensorFlow.sequential();
    expect(model).toBeDefined();
    expect(model.add).toBeDefined();
    expect(model.compile).toBeDefined();
    expect(model.predict).toBeDefined();
    expect(model.dispose).toBeDefined();
  });

  it('should create dense layers', () => {
    const layer = mockTensorFlow.layers.dense({ units: 32 });
    expect(layer).toBeDefined();
    expect(layer.units).toBe(32);
    expect(layer.apply).toBeDefined();
  });

  it('should create adam optimizer', () => {
    const optimizer = mockTensorFlow.train.adam(0.001);
    expect(optimizer).toBeDefined();
  });
});
