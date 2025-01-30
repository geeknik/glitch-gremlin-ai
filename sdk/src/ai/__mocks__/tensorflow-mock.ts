import { LayersModel, Sequential, Tensor } from '@tensorflow/tfjs-node';

const mockTensor = {
    dataSync: jest.fn().mockReturnValue(new Float32Array([0, 0])),
    dispose: jest.fn(),
    shape: [1, 2],
    dtype: 'float32'
} as unknown as Tensor;

const mockSequential = {
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({
        history: {
            loss: [0.5, 0.3],
            val_loss: [0.6, 0.4],
            metrics: ['accuracy']
        }
    }),
    predict: jest.fn().mockReturnValue(mockTensor),
    save: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
    layers: []
} as unknown as Sequential;

const mockLayersModel = {
    predict: jest.fn().mockReturnValue(mockTensor),
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({
        history: {
            loss: [0.5, 0.3],
            val_loss: [0.6, 0.4],
            metrics: ['accuracy']
        }
    }),
    evaluate: jest.fn().mockResolvedValue([0, 0] as number[]),
    save: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn()
} as unknown as LayersModel;

const tf = {
    sequential: jest.fn().mockReturnValue(mockSequential),
    layers: {
        dense: jest.fn().mockReturnValue({
            apply: jest.fn()
        })
    },
    train: {
        adam: jest.fn().mockImplementation((config: { learningRate: number }) => ({
            learningRate: config.learningRate,
            getConfig: jest.fn().mockReturnValue({ learningRate: config.learningRate })
        }))
    },
    tensor: jest.fn().mockReturnValue(mockTensor),
    tensor2d: jest.fn().mockReturnValue(mockTensor),
    loadLayersModel: jest.fn().mockResolvedValue(mockLayersModel),
    ready: jest.fn().mockResolvedValue(undefined)
};

export default tf;
