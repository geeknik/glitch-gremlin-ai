import * as tf from '@tensorflow/tfjs-node';

// Mock tensor class
class MockTensor {
constructor(public data: number[] | number[][] = []) {}

dispose() {}

reshape(shape: number[]): MockTensor {
    return this;
}

mean(): MockTensor {
    return this;
}

sub(other: MockTensor): MockTensor {
    return this;
}

square(): MockTensor {
    return this;
}
}

// Mock sequential model class
class MockSequentialModel {
layers: any[] = [];

add(layer: any) {
    this.layers.push(layer);
}

compile(config: any) {}

fit(x: any, y: any, config: any) {
    return Promise.resolve({
    history: {
        loss: [0.1],
        val_loss: [0.2]
    }
    });
}

predict(x: any) {
    return new MockTensor([0.1, 0.2, 0.3]);
}

save(path: string) {
    return Promise.resolve();
}

load(path: string) {
    return Promise.resolve(this);
}
}

// Mock layer functions
const mockLayers = {
lstm: (config: any) => ({
    apply: () => new MockTensor()
}),

dense: (config: any) => ({
    apply: () => new MockTensor() 
}),

dropout: (config: any) => ({
    apply: () => new MockTensor()
})
};

// Mock tensor operations
const mockOps = {
tensor: (data: number[] | number[][]) => new MockTensor(data),
tensor2d: (data: number[][]) => new MockTensor(data),
zeros: (shape: number[]) => new MockTensor(),
randomNormal: (shape: number[]) => new MockTensor()
};

// Main TensorFlow mock
const mockTf = {
sequential: () => new MockSequentialModel(),
layers: mockLayers,
tensor: mockOps.tensor,
tensor2d: mockOps.tensor2d,
zeros: mockOps.zeros,
randomNormal: mockOps.randomNormal,
tidy: (fn: Function) => fn(),
dispose: () => {},
memory: () => ({
    numTensors: 0,
    numDataBuffers: 0,
    numBytes: 0
})
};

// Set up Jest mocks and force CPU backend
jest.mock('@tensorflow/tfjs-node', () => {
    // Force CPU backend
    process.env.TF_CPP_MIN_LOG_LEVEL = '2';
    process.env.TF_FORCE_CPU = '1';
    return mockTf;
});

// Helper to reset all mocks
export const resetTensorFlowMocks = () => {
jest.clearAllMocks();
};

export default mockTf;

