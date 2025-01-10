import { jest } from '@jest/globals';

jest.setTimeout(10000);

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-key';

// Mock Redis for all tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    incr: jest.fn().mockResolvedValue(1 as never),
    expire: jest.fn().mockResolvedValue(1 as never),
    get: jest.fn().mockResolvedValue(null as never),
    set: jest.fn().mockResolvedValue('OK' as never),
    on: jest.fn()
  }));
});
