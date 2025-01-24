const tf = jest.createMockFromModule('@tensorflow/tfjs-node') as any;

// Enhanced mock with complete TensorFlow API simulation
tf.sequential = jest.fn(() => ({
  compile: jest.fn().mockReturnThis(),
  fit: jest.fn().mockResolvedValue({ 
    history: { 
      loss: [0.1, 0.08], // Simulate training progression
      val_loss: [0.2, 0.15],
      metrics: ['accuracy'] 
    } 
  }),
  predict: jest.fn().mockReturnValue({
    data: () => Promise.resolve(new Float32Array([0.5])),
    dataSync: () => new Float32Array([0.5]),
    dispose: jest.fn()
  }),
  save: jest.fn().mockResolvedValue(undefined),
  dispose: jest.fn(),
  summary: jest.fn(),
  add: jest.fn().mockReturnThis()
}));

// Mock layers and ops with simplified implementations
tf.layers = {
  lstm: jest.fn().mockReturnValue({
    apply: jest.fn().mockReturnValue({})
  }),
  dropout: jest.fn().mockReturnValue({}),
  dense: jest.fn().mockReturnValue({})
};

tf.train = {
  adam: jest.fn().mockReturnValue({})
};

// Tensor operations with memory management
tf.tensor2d = jest.fn().mockImplementation(data => ({
  dataSync: () => data,
  dispose: jest.fn()
}));

tf.tidy = jest.fn().mockImplementation(fn => {
  const result = fn();
  if (result?.dispose) result.dispose();
  return result;
});

tf.moments = jest.fn().mockReturnValue({ 
  mean: 0.5, 
  variance: 0.25 
});

// Model loading simulation
tf.loadLayersModel = jest.fn().mockResolvedValue(tf.sequential());

export default tf;
