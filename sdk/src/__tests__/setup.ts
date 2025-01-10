import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';

jest.setTimeout(10000);

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-key';

// Mock path and fs
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true)
}));

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
