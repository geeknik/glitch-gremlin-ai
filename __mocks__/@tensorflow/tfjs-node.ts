import { jest } from '@jest/globals';
import type { Sequential, LayersModel } from '@tensorflow/tfjs-layers';
import type { Tensor } from '@tensorflow/tfjs-core';

interface LayerConfig {
    name: string;
    units: number;
    activation: string;
    inputShape?: number[];
    kernelInitializer: string;
}

interface Layer {
    apply: jest.Mock;
    getWeights: jest.Mock;
    setWeights: jest.Mock;
    dispose: jest.Mock;
    name: string;
    units: number;
    activation: string;
    inputShape?: number[];
    kernelInitializer: string;
    getConfig: () => LayerConfig;
}

interface TensorMock {
    shape: number[];
    dataSync: () => Float32Array;
    dispose: jest.Mock;
    reshape: jest.Mock;
    mean: jest.Mock;
    sub: jest.Mock;
    square: jest.Mock;
}

const createTensorMock = (shape: number[] = [1, 1], data?: number[]): TensorMock => ({
    shape,
    dataSync: () => new Float32Array(data || Array(shape.reduce((a, b) => a * b)).fill(0.5)),
    dispose: jest.fn(),
    reshape: jest.fn().mockReturnThis(),
    mean: jest.fn().mockReturnThis(),
    sub: jest.fn().mockReturnThis(),
    square: jest.fn().mockReturnThis()
});

const createLayerMock = (config: LayerConfig): Layer => ({
    ...config,
    getConfig: () => ({
        units: config.units,
        activation: config.activation,
        inputShape: config.inputShape,
        kernelInitializer: config.kernelInitializer,
        name: config.name
    }),
    apply: jest.fn().mockReturnValue(createTensorMock()),
    getWeights: jest.fn(() => []),
    setWeights: jest.fn(),
    dispose: jest.fn()
});

class MockSequentialModel {
    layers: Layer[];
    add: jest.Mock;
    compile: jest.Mock;
    fit: jest.Mock;
    predict: jest.Mock;
    dispose: jest.Mock;
    summary: jest.Mock;
    getLayer: jest.Mock;
    getWeights: jest.Mock;
    setWeights: jest.Mock;
    evaluate: jest.Mock;

    constructor() {
        this.layers = [];
        this.add = jest.fn((layer: unknown) => {
            if (this.isLayer(layer)) {
                this.layers.push(layer);
            }
            return this;
        });
        this.compile = jest.fn().mockReturnThis();
        this.fit = jest.fn(() => Promise.resolve({ history: { loss: [0.1], accuracy: [0.9] } }));
        this.predict = jest.fn(() => createTensorMock());
        this.dispose = jest.fn();
        this.summary = jest.fn();
        this.getLayer = jest.fn();
        this.getWeights = jest.fn(() => []);
        this.setWeights = jest.fn();
        this.evaluate = jest.fn(() => Promise.resolve([0.1, 0.9]));
    }

    private isLayer(layer: unknown): layer is Layer {
        return layer !== null && 
               typeof layer === 'object' && 
               'getConfig' in layer &&
               'apply' in layer &&
               'getWeights' in layer &&
               'setWeights' in layer &&
               'dispose' in layer;
    }
}

const createMockSequential = () => {
    const model = new MockSequentialModel();
    Object.defineProperty(model, 'add', {
        enumerable: true,
        configurable: true,
        writable: true,
        value: jest.fn((layer: any) => {
            model.layers.push(layer);
            return model;
        })
    });
    return model;
};

const mockTf = {
    ready: jest.fn(() => Promise.resolve()),
    setBackend: jest.fn(() => Promise.resolve(true)),
    sequential: jest.fn(() => new MockSequentialModel()),
    layers: {
        dense: jest.fn((config: LayerConfig) => createLayerMock(config))
    },
    train: {
        adam: jest.fn(() => ({ learningRate: 0.001 }))
    },
    tensor: jest.fn((data: number[]) => createTensorMock([data.length], data)),
    tensor1d: jest.fn((data: number[]) => createTensorMock([data.length], data)),
    tensor2d: jest.fn((data: number[], shape?: [number, number]) => createTensorMock(shape || [data.length, 1], data.flat())),
    tidy: jest.fn(<T>(fn: () => T): T => fn()),
    dispose: jest.fn(),
    moments: jest.fn(() => ({
        mean: createTensorMock([1], [0]),
        variance: createTensorMock([1], [1])
    })),
    sqrt: jest.fn((tensor: TensorMock) => createTensorMock(tensor.shape, Array.from(tensor.dataSync()))),
    sub: jest.fn((a: TensorMock, b: TensorMock) => createTensorMock(a.shape, Array.from(a.dataSync()))),
    div: jest.fn((a: TensorMock, b: TensorMock) => createTensorMock(a.shape, Array.from(a.dataSync()))),
    mean: jest.fn((tensor: TensorMock) => createTensorMock([1], [0.5])),
    sum: jest.fn((tensor: TensorMock) => createTensorMock([1], [1.0])),
    zeros: jest.fn((shape: number[]) => createTensorMock(shape)),
    ones: jest.fn((shape: number[]) => createTensorMock(shape)),
    randomNormal: jest.fn((shape: number[]) => createTensorMock(shape)),
    getBackend: jest.fn(() => 'cpu'),
    env: {
        memory: jest.fn(() => ({ numTensors: 0, numBytes: 0, numDataBuffers: 0 }))
    },
    loadLayersModel: jest.fn(async () => createMockSequential())
};

export default mockTf;

// Export individual functions for named imports
export const ready = mockTf.ready;
export const setBackend = mockTf.setBackend;
export const sequential = mockTf.sequential;
export const layers = mockTf.layers;
export const train = mockTf.train;
export const tensor = mockTf.tensor;
export const tensor1d = mockTf.tensor1d;
export const tensor2d = mockTf.tensor2d;
export const tidy = mockTf.tidy;
export const dispose = mockTf.dispose;
export const moments = mockTf.moments;
export const sqrt = mockTf.sqrt;
export const sub = mockTf.sub;
export const div = mockTf.div;
export const mean = mockTf.mean;
export const sum = mockTf.sum;
export const zeros = mockTf.zeros;
export const ones = mockTf.ones;
export const randomNormal = mockTf.randomNormal;
export const getBackend = mockTf.getBackend;
export const env = mockTf.env;
export const loadLayersModel = mockTf.loadLayersModel;
