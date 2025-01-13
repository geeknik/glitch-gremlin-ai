import * as tf from '@tensorflow/tfjs-node';
import { RLFuzzingModel } from '../src/reinforcement-fuzzing';

interface RLModelConfig {
    stateSize: number;
    actionSize: number;
    batchSize: number;
    memorySize: number;
    gamma: number;
    learningRate: number;
}

interface FuzzingState {
    programCounter: number;
    coverage: number[];
    lastCrash: Date | null;
    mutationHistory: string[];
    executionTime: number;
}

jest.mock('@tensorflow/tfjs-node');

describe('RLFuzzingModel', () => {
let model: RLFuzzingModel;
let mockCompile: jest.SpyInstance<void, [tf.ModelCompileArgs]>;
let mockPredict: jest.SpyInstance<tf.Tensor | tf.Tensor[], [tf.Tensor | tf.Tensor[], tf.ModelPredictArgs | undefined]>;
let mockDispose: jest.SpyInstance<void, []>;

beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Mock TensorFlow methods
    mockCompile = jest.spyOn(tf.Sequential.prototype, 'compile');
    mockPredict = jest.spyOn(tf.Sequential.prototype, 'predict').mockReturnValue(tf.tensor([0.1, 0.2, 0.3, 0.4, 0.5]));
    mockDispose = jest.spyOn(tf.Tensor.prototype, 'dispose');
    
    // Initialize model with test configuration
    model = new RLFuzzingModel({
    stateSize: 10,
    actionSize: 5,
    batchSize: 32,
    memorySize: 1000,
    gamma: 0.95,
    learningRate: 0.001,
    });
});

afterEach(() => {
    // Clean up resources
    if (model) {
    model.dispose();
    }
});

describe('initialization', () => {
    test('should create model with correct configuration', () => {
        expect(model).toBeDefined();
        expect(model.getStateSize()).toBe(10);
        expect(model.getActionSize()).toBe(5);
        expect(mockCompile).toHaveBeenCalledTimes(1);
    });

    test('should throw error with invalid configuration', () => {
    expect(() => {
        new RLFuzzingModel({
        stateSize: -1,
        actionSize: 5,
        batchSize: 32,
        memorySize: 1000,
        gamma: 0.95,
        learningRate: 0.001,
        });
    }).toThrow('Invalid state size');
    });
});

describe('action selection', () => {
    test('should select valid action based on state', async () => {
    const state = tf.zeros([1, 10]);
    const action = await model.selectAction(state);
    
    expect(action).toBeGreaterThanOrEqual(0);
    expect(action).toBeLessThan(5);
    expect(mockPredict).toHaveBeenCalledTimes(1);
    });

    test('should handle exploration vs exploitation', async () => {
    model.setEpsilon(1.0); // Force exploration
    const state: FuzzingState = {
        programCounter: 0,
        coverage: Array(10).fill(0),
        lastCrash: null,
        mutationHistory: [],
        executionTime: 0
    };
    const action = await model.selectAction(state);
    
    expect(mockPredict).not.toHaveBeenCalled();
    expect(action).toBeGreaterThanOrEqual(0);
    expect(action).toBeLessThan(5);
    });
});

describe('memory management', () => {
    test('should add experience to memory', () => {
    const state = tf.zeros([1, 10]);
    const nextState = tf.ones([1, 10]);
    
    model.addExperience(state, 1, 1.0, nextState, false);
    expect(model.getMemorySize()).toBe(1);
    });

    test('should respect maximum memory size', () => {
    for (let i = 0; i < 1100; i++) {
        const state = tf.zeros([1, 10]);
        const nextState = tf.ones([1, 10]);
        model.remember(state, 1, 1.0, nextState, false);
    }
    expect(model.getMemorySize()).toBe(1000);
    });
});

describe('training', () => {
    test('should train on batch of experiences', async () => {
    const mockFit = jest.spyOn(tf.Sequential.prototype, 'fit');
    
    // Add some experiences
    for (let i = 0; i < 50; i++) {
        const state = tf.zeros([1, 10]);
        const nextState = tf.ones([1, 10]);
        model.remember(state, 1, 1.0, nextState, false);
    }

    await model.train();
    expect(mockFit).toHaveBeenCalled();
    });

    test('should skip training with insufficient memory', async () => {
    const mockFit = jest.spyOn(tf.Sequential.prototype, 'fit');
    await model.train();
    expect(mockFit).not.toHaveBeenCalled();
    });
});

describe('model persistence', () => {
    test('should save model weights', async () => {
    const mockSave = jest.spyOn(tf.Sequential.prototype, 'save');
    await model.saveModel('test-model');
    expect(mockSave).toHaveBeenCalled();
    });

    test('should load model weights', async () => {
        const mockLoad = jest.spyOn(tf, 'loadLayersModel');
        await model.loadModel('test-model');
        expect(mockLoad).toHaveBeenCalled();
    });

    test('should handle loading errors gracefully', async () => {
    const mockLoad = jest.spyOn(tf, 'loadLayersModel')
        .mockRejectedValue(new Error('File not found'));
    
    await expect(model.load('non-existent-model'))
        .rejects.toThrow('Failed to load model');
    });
});

describe('resource management', () => {
    test('should dispose tensors properly', () => {
    const state = tf.zeros([1, 10]);
    model.dispose();
    expect(mockDispose).toHaveBeenCalled();
    });

    test('should handle multiple dispose calls safely', () => {
    model.dispose();
    expect(() => model.dispose()).not.toThrow();
    });
});
});

