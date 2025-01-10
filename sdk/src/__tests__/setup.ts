import { jest } from '@jest/globals';

// Set consistent timeout for all tests
jest.setTimeout(30000);

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-key';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Enhanced Redis mock with proper cleanup
jest.mock('ioredis', () => {
  const mockRedis = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true)
  };
  return jest.fn(() => mockRedis);
});

// Mock Solana connection methods
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getAccountInfo: jest.fn().mockResolvedValue({
        data: Buffer.from('{}'),
        executable: false,
        lamports: 0,
        owner: new actual.PublicKey('11111111111111111111111111111111'),
        rentEpoch: 0
      }),
      sendTransaction: jest.fn().mockResolvedValue('mock-signature'),
      simulateTransaction: jest.fn().mockResolvedValue({
        context: { slot: 0 },
        value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
      }),
      getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.18.26' })
    }))
  };
});
import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-key';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Add missing globals
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true)
  }));
});

// Mock Solana connection
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getAccountInfo: jest.fn().mockResolvedValue({
        data: Buffer.from('{}'),
        executable: false,
        lamports: 0,
        owner: new actual.PublicKey('11111111111111111111111111111111'),
        rentEpoch: 0
      }),
      sendTransaction: jest.fn().mockResolvedValue('mock-signature'),
      simulateTransaction: jest.fn().mockResolvedValue({
        context: { slot: 0 },
        value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
      }),
      getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.18.26' })
    }))
  };
});
