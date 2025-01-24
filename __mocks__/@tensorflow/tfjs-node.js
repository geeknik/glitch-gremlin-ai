const tf = {
    sequential: jest.fn(() => {
        console.log('Mock tf.sequential() called');
        const model = {
            add: jest.fn().mockReturnThis(),
            compile: jest.fn(),
            predict: jest.fn(() => ({
                dataSync: jest.fn(() => [0]),
                array: jest.fn(() => Promise.resolve([[0]])),
                dispose: jest.fn()
            })),
            getWeights: jest.fn(() => []),
            setWeights: jest.fn(),
            dispose: jest.fn(),
            fit: jest.fn(() => Promise.resolve({ 
                history: { 
                    loss: [0.1],
                    accuracy: [0.9]
                }
            })),
            save: jest.fn(() => Promise.resolve()),
            load: jest.fn(() => Promise.resolve())
        };
        console.log('Mock tf.sequential() returning model:', model);
        return model;
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

    tensor2d: jest.fn((values, shape) => ({
        shape: shape,
        dtype: 'float32',
        dataSync: jest.fn(() => values.flat()),
        array: jest.fn(() => Promise.resolve(values)),
        dispose: jest.fn()
    })),

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
