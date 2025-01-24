const mock = {
    sequential: jest.fn(() => ({
        add: jest.fn(),
        compile: jest.fn(),
        fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
        predict: jest.fn().mockReturnValue({ data: async () => [0.5] }),
        evaluate: jest.fn(),
        save: jest.fn()
    })),
    tensor: jest.fn(),
    train: {
        adam: jest.fn()
    },
    layers: {
        dense: jest.fn()
    }
};

export default mock;

