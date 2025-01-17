import * as tf from '@tensorflow/tfjs-node';

const sequential = () => ({
add: jest.fn(),
compile: jest.fn(),
predict: jest.fn().mockReturnValue({
    dataSync: jest.fn().mockReturnValue(new Float32Array(10)),
    dispose: jest.fn()
}),
fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
save: jest.fn().mockResolvedValue(undefined),
dispose: jest.fn()
});

const mockTF: typeof tf = {
tensor: jest.fn().mockReturnValue({
dataSync: jest.fn().mockReturnValue(new Float32Array(10)),
dispose: jest.fn(),
reshape: jest.fn(),
mul: jest.fn(),
add: jest.fn(),
sub: jest.fn()
}),
sequential: jest.fn().mockReturnValue(sequential()),
layers: {
dense: jest.fn().mockReturnValue({
    apply: jest.fn(),
    getWeights: jest.fn().mockReturnValue([]),
    setWeights: jest.fn(),
    dispose: jest.fn()
}),
flatten: jest.fn().mockReturnValue({
    apply: jest.fn(),
    dispose: jest.fn()
}),
conv2d: jest.fn().mockReturnValue({
    apply: jest.fn(),
    dispose: jest.fn()
}),
maxPooling2d: jest.fn().mockReturnValue({
    apply: jest.fn(),
    dispose: jest.fn()
}),
dropout: jest.fn().mockReturnValue({
    apply: jest.fn(),
    dispose: jest.fn()
})
},
train: {
sgd: jest.fn().mockReturnValue({
    apply: jest.fn(),
    getConfig: jest.fn(),
    dispose: jest.fn()
}),
adam: jest.fn().mockReturnValue({
    apply: jest.fn(),
    getConfig: jest.fn(),
    dispose: jest.fn()
}),
rmsprop: jest.fn().mockReturnValue({
    apply: jest.fn(),
    getConfig: jest.fn(),
    dispose: jest.fn()
}),
    sgd: jest.fn()
  },
  tidy: jest.fn(),
  dispose: jest.fn(),
  ready: jest.fn().mockResolvedValue(true),
  backend: jest.fn(),
  setBackend: jest.fn(),
  loadLayersModel: jest.fn(),
  tensor1d: jest.fn(),
  tensor2d: jest.fn(),
  scalar: jest.fn(),
  mul: jest.fn(),
  add: jest.fn(),
  sub: jest.fn(),
  div: jest.fn(),
  mean: jest.fn(),
  sum: jest.fn(),
  stack: jest.fn(),
  concat: jest.fn(),
  expandDims: jest.fn(),
  squeeze: jest.fn(),
  cast: jest.fn(),
  ones: jest.fn(),
  zeros: jest.fn(),
  randomNormal: jest.fn(),
  where: jest.fn(),
  greater: jest.fn(),
  less: jest.fn(),
  equal: jest.fn(),
  logicalAnd: jest.fn(),
  logicalOr: jest.fn(),
  logicalNot: jest.fn(),
  logicalXor: jest.fn(),
  clipByValue: jest.fn(),
  minimum: jest.fn(),
  maximum: jest.fn(),
  abs: jest.fn(),
  sigmoid: jest.fn(),
  tanh: jest.fn(),
  relu: jest.fn(),
  softmax: jest.fn(),
  log: jest.fn(),
  exp: jest.fn(),
  pow: jest.fn(),
  sqrt: jest.fn(),
  square: jest.fn(),
  norm: jest.fn(),
  dot: jest.fn(),
  matMul: jest.fn(),
  transpose: jest.fn(),
  reverse: jest.fn(),
  gather: jest.fn(),
  slice: jest.fn(),
  reshape: jest.fn(),
  pad: jest.fn(),
  image: {
    resizeBilinear: jest.fn()
  },
  memory: {
    numTensors: 0,
    numDataBuffers: 0,
    numBytes: 0
  }
};

export default mockTF;
