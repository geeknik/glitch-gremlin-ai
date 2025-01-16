import { jest } from '@jest/globals';

// Set up ESM compatibility
process.env.NODE_OPTIONS = '--experimental-vm-modules';

// Extend expect matchers if needed
expect.extend({});

// Global test setup
beforeAll(() => {
    // Clear all mocks before each test suite
    jest.clearAllMocks();
    
    // Set up ESM test environment
    process.env.NODE_ENV = 'test';
    process.env.DEBUG = 'false';
});

// Global test teardown
afterAll(() => {
    jest.resetModules();
    delete process.env.NODE_OPTIONS;
});
