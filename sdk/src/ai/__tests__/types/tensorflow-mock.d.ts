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

export declare const mockTf: TensorFlowMock;
