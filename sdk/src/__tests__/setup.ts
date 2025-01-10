import { jest } from '@jest/globals';

jest.setTimeout(10000);

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-key';

// Mock Redis for all tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    on: jest.fn()
  }));
});
