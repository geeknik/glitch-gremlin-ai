import { jest } from '@jest/globals';

// Global setup for Jest tests
jest.setTimeout(10000); // Increase default timeout

// Mock console methods to keep test output clean
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
