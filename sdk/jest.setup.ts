import { jest } from '@jest/globals';

// Configure Jest to use ES modules
jest.useFakeTimers();
jest.setTimeout(10000);

// Mock console methods
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

afterAll(() => {
  jest.restoreAllMocks();
});
