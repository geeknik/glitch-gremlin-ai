import type { Tensor } from '@tensorflow/tfjs-node';

interface Layer {
    apply: (input: Tensor) => Tensor;
    getClassName: () => string;
}

interface Sequential {
    add: (layer: Layer) => Sequential;
    compile: (config: any) => void;
    fit: (x: Tensor, y: Tensor, config: any) => Promise<any>;
    predict: (input: Tensor) => Tensor;
    dispose: () => void;
    layers: Layer[];
    save: (path: string) => Promise<void>;
    load: (path: string) => Promise<void>;
}

const mockTf = {
    sequential: () => ({
        add: jest.fn().mockImplementation((layer) => {
            return {
                layers: [layer],
                compile: jest.fn(),
                fit: jest.fn().mockResolvedValue({}),
                predict: jest.fn().mockReturnValue({
                    array: () => Promise.resolve([[0.8, 0.2]]),
                    dispose: jest.fn()
                }),
                dispose: jest.fn(),
                save: jest.fn().mockResolvedValue(undefined),
                load: jest.fn().mockResolvedValue(undefined)
            };
        }),
        compile: jest.fn(),
        fit: jest.fn().mockResolvedValue({}),
        predict: jest.fn().mockReturnValue({
            array: () => Promise.resolve([[0.8, 0.2]]),
            dispose: jest.fn()
        }),
        dispose: jest.fn(),
        layers: [],
        save: jest.fn().mockResolvedValue(undefined),
        load: jest.fn().mockResolvedValue(undefined)
    }),
    layers: {
        dense: (config: any) => ({
            apply: jest.fn(),
            getClassName: () => 'Dense',
            ...config
        }),
        dropout: (config: any) => ({
            apply: jest.fn(),
            getClassName: () => 'Dropout',
            ...config
        })
    },
    train: {
        adam: (learningRate: number) => ({
            learningRate
        })
    },
    tensor2d: (data: number[][], shape?: number[]) => ({
        shape: shape || [data.length, data[0]?.length || 0],
        dataSync: () => new Float32Array(data.flat()),
        dispose: jest.fn(),
        array: () => Promise.resolve(data)
    }),
    dispose: jest.fn(),
    disposeVariables: jest.fn(),
    loadLayersModel: jest.fn().mockImplementation((path: string) => {
        return Promise.resolve({
            compile: jest.fn(),
            fit: jest.fn().mockResolvedValue({}),
            predict: jest.fn().mockReturnValue({
                array: () => Promise.resolve([[0.8, 0.2]]),
                dispose: jest.fn()
            }),
            dispose: jest.fn(),
            save: jest.fn().mockResolvedValue(undefined)
        });
    })
};

export default mockTf;
