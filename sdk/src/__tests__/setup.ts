import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';
import type { Connection } from '@solana/web3.js';
import type Redis from 'ioredis';

// Increase default timeout to avoid timeouts in longer tests
jest.setTimeout(60000);

// Add missing globals
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock environment variables
process.env.HELIUS_API_KEY = 'test-key';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Create typed mock helpers
let requestCount = { value: 0 };

// Enhanced Redis mock with proper cleanup and types
jest.mock('ioredis', () => {
const mockRedis = {
    // Counter operations
    incr: jest.fn().mockImplementation(async (key: string) => {
    if (key === 'request_count') {
        requestCount.value += 1;
        return requestCount.value;
    }
    return 1;
    }),
    expire: jest.fn().mockResolvedValue(1),
    
    // Key-value operations
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    keys: jest.fn().mockResolvedValue([]),

    // Connection management
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    connect: jest.fn().mockResolvedValue(true),

    // Pub/sub operations  
    publish: jest.fn().mockResolvedValue(0),
    subscribe: jest.fn().mockImplementation((channel: string, callback?: () => void) => {
    if (callback) callback();
    }),
    unsubscribe: jest.fn()
} as jest.Mocked<Redis>;

return jest.fn(() => mockRedis);
});

// Make mockRequestCount available to tests
(global as any).mockRequestCount = requestCount;
// Mock Solana connection with improved data structures and types
jest.mock('@solana/web3.js', () => {
const actual = jest.requireActual('@solana/web3.js');

const mockConnection = {
    getAccountInfo: jest.fn().mockResolvedValue({
    data: Buffer.from(JSON.stringify({
        version: 1,
        state: 'Active',
        votingPower: 1000,
        proposer: '11111111111111111111111111111111'
    })),
    executable: false,
    lamports: 1000000,
    owner: new actual.PublicKey('11111111111111111111111111111111'),
    rentEpoch: 0
    }),

    // Transaction methods
    sendTransaction: jest.fn().mockResolvedValue(Promise.resolve('mock-signature')),
    simulateTransaction: jest.fn().mockResolvedValue(Promise.resolve({
    context: { slot: 0 },
    value: {
        err: null,
        logs: ['Program log: Instruction: Initialize'],
        accounts: null,
        unitsConsumed: 0,
        returnData: null
    }
    })),
    confirmTransaction: jest.fn().mockResolvedValue({
    value: { err: null }
    }),

    // Query methods
    getBalance: jest.fn().mockResolvedValue(Promise.resolve(1000000000)),
    getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.18.26' }),
    getRecentBlockhash: jest.fn().mockResolvedValue({
    blockhash: 'test-blockhash',
    feeCalculator: {
        lamportsPerSignature: 5000
    }
    })
} as jest.Mocked<Connection>;

return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => mockConnection)
};
});
