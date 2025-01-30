import mockTf from './__mocks__/tf-mock.js';

jest.mock('@tensorflow/tfjs-node', () => mockTf);

// Configure Jest environment
process.env.NODE_ENV = 'test';

// Add any global test setup here
beforeAll(() => {
    // Setup any test environment variables or global mocks
});

afterAll(() => {
    // Cleanup any resources after all tests
});
