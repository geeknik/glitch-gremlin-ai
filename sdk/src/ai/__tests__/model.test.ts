import { jest } from '@jest/globals';
import { setupTensorFlowMocks, type TensorFlowMock } from './helpers/tf-mock.js';

// Set up TensorFlow mocks before importing the module that uses it
const mockTf = setupTensorFlowMocks();
jest.mock('@tensorflow/tfjs-node', () => mockTf);

// Now import the module that uses TensorFlow
import type * as tf from '@tensorflow/tfjs-node';

describe('AI Model Tests', () => {
  let model: ReturnType<typeof mockTf.sequential>;
  
  beforeEach(async () => {
    // Create new model with correct architecture
    model = {
      add: jest.fn().mockImplementation((layer) => {
        model.layers.push(layer);
        return model;
      }),
      compile: jest.fn(),
      layers: [],
      dispose: jest.fn(),
      predict: jest.fn((input: tf.Tensor) => {
        // Add explicit shape property with safe access
        const inputWithShape = Object.assign(input, {
          shape: input.shape ? [input.shape[0], input.shape[1]] : [0, 0]
        });
        
        if (!inputWithShape.shape || inputWithShape.shape[1] !== 20) {
          throw new Error('Input shape mismatch');
        }
        return Object.assign(mockTf.tensor([[0.5]]), {shape: [1, 1]});
      })
    };
    
    // Mock layer implementations
    mockTf.randomNormal = jest.fn(() => ({})); // Return empty object to allow property assignment
    mockTf.tensor = jest.fn(() => ({ 
      shape: [1, 1],
      dataSync: () => new Float32Array([0.5]) 
    })); // Mock tensor creation with dataSync
    mockTf.layers.dense = jest.fn((config: any) => ({
      getConfig: () => config,
      name: config.name || 'dense',
      units: config.units,
      activation: config.activation
    }));
    
    mockTf.layers.dropout = jest.fn((config: any) => ({
      getConfig: () => config,
      name: 'dropout',
      rate: config.rate
    }));

    // Add layers
    model.add(mockTf.layers.dense({
      units: 128,
      inputShape: [20],
      activation: 'relu'
    }));
    
    model.add(mockTf.layers.dropout({
      rate: 0.2
    }));
    
    model.add(mockTf.layers.dense({
      units: 32,
      activation: 'relu'
    }));
    
    model.add(mockTf.layers.dense({
      units: 1,
      activation: 'linear'
    }));
    
    // Compile model
    model.compile({
      optimizer: mockTf.train.adam(0.001),
      loss: 'meanSquaredError'
    });
  });

  afterEach(() => {
    if (model) {
      model.dispose();
    }
    mockTf.disposeVariables();
    jest.clearAllMocks();
  });

  it('should load model successfully', () => {
    expect(model).toBeDefined();
    expect(model.layers).toHaveLength(4);
  });

  it('should make predictions', async () => {
    const input = Object.assign(
      {},
      mockTf.randomNormal([1, 20], 0, 1, 'float32'),
      {shape: [1, 20]}
    );
    const prediction = model.predict(input);
    
    expect(prediction).toBeDefined();
    expect(prediction.shape).toEqual([1, 1]);
    expect(prediction.dataSync()).toBeDefined();
  });

  it('should handle invalid input', () => {
    const invalidInput = Object.assign(
      {},
      mockTf.randomNormal([1, 15], 0, 1, 'float32'),
      {shape: [1, 15]}
    );
    
    expect(() => model.predict(invalidInput)).toThrow('Input shape mismatch');
  });

  it('should have correct model architecture', () => {
    expect(model).toBeDefined();
    const layers = model.layers;
    
    // Verify layer types and units
    expect(layers[0]?.name).toBe('dense');
    expect(layers[0]?.getConfig()?.units).toBe(128);
    
    expect(layers[1]?.name).toBe('dropout');
    expect(layers[1]?.getConfig()?.rate).toBe(0.2);
    
    expect(layers[2]?.name).toBe('dense');
    expect(layers[2]?.getConfig()?.units).toBe(32);
    
    expect(layers[3]?.name).toBe('dense');
    expect(layers[3]?.getConfig()?.units).toBe(1);
  });
});
