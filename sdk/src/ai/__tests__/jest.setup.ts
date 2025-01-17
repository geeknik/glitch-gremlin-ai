jest.mock('@tensorflow/tfjs-node', () => {
    // Define mock implementations
    const mockTensor = {
        dataSync: jest.fn(() => new Float32Array([1, 2, 3])),
        dispose: jest.fn(),
        reshape: jest.fn().mockReturnThis(),
        mean: jest.fn().mockReturnThis(),
        sub: jest.fn().mockReturnThis(),
        square: jest.fn().mockReturnThis(),
        sqrt: jest.fn().mockReturnThis()
    };

    const mockSequentialModel = {
        add: jest.fn().mockReturnThis(),
        compile: jest.fn(),
        fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
        predict: jest.fn(() => mockTensor),
        save: jest.fn().mockResolvedValue(undefined),
        load: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn()
    };

    const mockLayers = {
        lstm: jest.fn(() => ({
            apply: jest.fn().mockReturnThis()
        })),
        dense: jest.fn(() => ({
            apply: jest.fn().mockReturnThis()
        })),
        dropout: jest.fn(() => ({
            apply: jest.fn().mockReturnThis()
        }))
    };

    // Create and return the mock TensorFlow object
    return {
        sequential: jest.fn(() => mockSequentialModel),
        tensor: jest.fn(() => mockTensor),
        tensor1d: jest.fn(() => mockTensor),
        tensor2d: jest.fn(() => mockTensor),
        stack: jest.fn(() => mockTensor),
        tidy: jest.fn((f) => f()),
        memory: jest.fn(() => ({
            numTensors: 0,
            numDataBuffers: 0,
            numBytes: 0
        })),
        dispose: jest.fn(),
        layers: mockLayers,
        Sequential: {
            prototype: {
                compile: jest.fn(),
                fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
                predict: jest.fn(() => mockTensor)
            }
        },
        Tensor: {
            prototype: {
                dispose: jest.fn(),
                dataSync: jest.fn(() => new Float32Array([1, 2, 3]))
            }
        }
    };
});

// Add to global
global.tf = jest.requireMock('@tensorflow/tfjs-node');
