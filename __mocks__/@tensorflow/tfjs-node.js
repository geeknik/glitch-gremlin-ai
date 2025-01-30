const tf = {
    sequential: jest.fn().mockImplementation(() => {
        const mockLayers = [];
        const mockModel = {
            add: jest.fn().mockImplementation((layer) => {
                mockLayers.push(layer);
                return mockModel;
            }),
            compile: jest.fn().mockReturnThis(),
            fit: jest.fn().mockResolvedValue({
                history: { loss: [0.1], val_loss: [0.08] }
            }),
            predict: jest.fn().mockReturnValue({
                data: () => Promise.resolve(new Float32Array([0.5])),
                dispose: jest.fn(),
                arraySync: () => [[0.5]]
            }),
            save: jest.fn().mockResolvedValue(undefined),
            dispose: jest.fn(),
            summary: jest.fn(),
            getLayer: jest.fn().mockImplementation((name) => mockLayers.find(l => l.name === name)),
            layers: mockLayers
        };
        return mockModel;
    }),

    layers: {
        dense: jest.fn((config) => ({
            apply: jest.fn(),
            getWeights: jest.fn(() => []),
            setWeights: jest.fn(),
            units: config.units,
            activation: config.activation,
            inputShape: config.inputShape
        }))
    },

    train: {
        adam: jest.fn(() => ({
            apply: jest.fn(),
            minimize: jest.fn()
        }))
    },

    tensor: jest.fn((values, shape) => ({
        shape: shape || [values.length],
        dtype: 'float32',
        dataSync: jest.fn(() => values),
        arraySync: jest.fn(() => values),
        dispose: jest.fn()
    })),

    tensor2d: jest.fn((values, shape) => {
        const tensor = {
            shape: shape,
            dtype: 'float32',
            dataSync: jest.fn(() => values.flat()),
            array: jest.fn(() => Promise.resolve(values)),
            dispose: jest.fn(),
            slice: jest.fn().mockImplementation((start, size) => ({
                dispose: jest.fn(),
                dataSync: jest.fn(() => values.flat()),
                array: jest.fn(() => Promise.resolve(values)),
                shape: size,
                slice: jest.fn() // Allow chaining of slice calls
            }))
        };
        return tensor;
    }),

    concat: jest.fn((tensors) => ({
        dispose: jest.fn()
    })),

    argMax: jest.fn(() => ({
        dataSync: jest.fn(() => [0]),
        dispose: jest.fn()
    })),

    dispose: jest.fn(),
    
    tidy: jest.fn((fn) => fn()),

    loadLayersModel: jest.fn(() => Promise.resolve(tf.sequential()))
};

module.exports = tf;
