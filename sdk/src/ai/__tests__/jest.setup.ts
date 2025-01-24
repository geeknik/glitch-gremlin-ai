import mockTf from './__mocks__/tf-mock';

// Set up TensorFlow mock implementations
beforeAll(() => {
  // The mock implementation is already fully defined in tf-mock.ts
  // No need to redefine it here since we're importing the mock directly
  jest.doMock('@tensorflow/tfjs-node', () => mockTf);
});
