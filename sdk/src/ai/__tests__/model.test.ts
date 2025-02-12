import * as tf from '@tensorflow/tfjs-node';
import { ConcreteMLModel } from '../src/concrete-ml-model.js';

import * as tf from '@tensorflow/tfjs-node';
import mockTf from '../__mocks__/@tensorflow/tfjs-node';

// Mock TensorFlow.js
jest.mock('@tensorflow/tfjs-node', () => mockTf);

describe('ConcreteMLModel', () => {
    let model: ConcreteMLModel;
    let mockSequential: any;
    let mockTensor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock tensor operations
        mockTensor = {
            dispose: jest.fn(),
            data: () => Promise.resolve(new Float32Array([0.5])),
            shape: [1, 10],
            arraySync: () => [0.5]
        };

        (tf.tensor2d as jest.Mock).mockReturnValue(mockTensor);

        // Mock layers
        const mockDense = {
            apply: jest.fn(),
            getConfig: () => ({}),
            name: 'dense'
        };
        (tf.layers.dense as jest.Mock).mockReturnValue(mockDense);

        // Mock sequential model
        mockSequential = {
            add: jest.fn(),
            compile: jest.fn(),
            fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
            predict: jest.fn().mockReturnValue(mockTensor),
            dispose: jest.fn(),
            layers: [],
            save: jest.fn().mockResolvedValue(undefined)
        };
        (tf.sequential as jest.Mock).mockReturnValue(mockSequential);
        (tf.loadLayersModel as jest.Mock).mockResolvedValue(mockSequential);

        // Mock optimizer
        (tf.train.adam as jest.Mock).mockReturnValue({});

        // Create model instance
        model = new ConcreteMLModel({
            inputShape: [10],
            hiddenLayers: [20, 15],
            outputShape: 5,
            learningRate: 0.001
        });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    test('should create model with correct architecture', () => {
        expect(tf.sequential).toHaveBeenCalled();
        expect(tf.layers.dense).toHaveBeenCalledTimes(3);
        
        // Check input layer
        expect(tf.layers.dense).toHaveBeenNthCalledWith(1, {
            units: 20,
            activation: 'relu',
            inputShape: [10]
        });

        // Check hidden layer
        expect(tf.layers.dense).toHaveBeenNthCalledWith(2, {
            units: 15,
            activation: 'relu'
        });

        // Check output layer
        expect(tf.layers.dense).toHaveBeenNthCalledWith(3, {
            units: 5,
            activation: 'softmax'
        });
    });

    test('should train model correctly', async () => {
        const mockTrainData = {
            xs: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
            ys: [[1, 0, 0, 0, 0]]
        };

        await model.train(mockTrainData.xs, mockTrainData.ys, {
            epochs: 10,
            batchSize: 32
        });

        expect(mockSequential.fit).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            {
                epochs: 10,
                batchSize: 32,
                validationSplit: 0.1,
                verbose: 1
            }
        );
    });

    test('should predict correctly', async () => {
        const mockInput = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]];
        const prediction = await model.predict(mockInput);

        expect(mockSequential.predict).toHaveBeenCalled();
        expect(prediction).toBeDefined();
    });

    test('should save and load model', async () => {
        const path = 'test/model';
        await model.save(path);
        await model.load(path);

        expect(mockSequential.save).toHaveBeenCalledWith(`file://${path}`);
        expect(tf.loadLayersModel).toHaveBeenCalledWith(`file://${path}`);
    });

    test('should dispose resources correctly', () => {
        model.dispose();
        expect(mockSequential.dispose).toHaveBeenCalled();
    });
});
