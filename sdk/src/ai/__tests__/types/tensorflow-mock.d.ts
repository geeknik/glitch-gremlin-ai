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

declare const mockTf: TensorFlowMock;
export { mockTf };

describe('TensorFlowMock', () => {
  it('should have required properties', () => {
    expect(mockTf).toHaveProperty('sequential');
    expect(mockTf).toHaveProperty('layers.dense');
    expect(mockTf).toHaveProperty('train.adam');
    expect(mockTf).toHaveProperty('tensor');
    expect(mockTf).toHaveProperty('tensor2d');
    expect(mockTf).toHaveProperty('model');
    expect(mockTf).toHaveProperty('ready');
    expect(mockTf).toHaveProperty('dispose');
    expect(mockTf).toHaveProperty('backend');
    expect(mockTf).toHaveProperty('memory');
  });
});
