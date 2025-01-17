import { Connection } from '@solana/web3.js';
import RedisMock from './__mocks__/ioredis';
import { jest } from '@jest/globals';

// Import mock first
import { mockTF } from './__mocks__/tf-mock';

// Setup mock before any imports that might use it
jest.mock('@tensorflow/tfjs-node', () => {
  return mockTF;
});

// Add to global scope
global.tf = mockTF;

// Setup Jest environment
jest.useFakeTimers({ enableGlobally: true });

// Environment variables
process.env.HELIUS_API_KEY = 'test-helius-key';
process.env.NODE_ENV = 'test';

interface RedisMock {
    status: string;
    keyPrefix: string;
    flushall(): Promise<void>;
    quit(): Promise<void>;
    connect(): Promise<void>;
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
}

interface SecurityMock {
    validateRequest: jest.Mock;
    generateNonce: jest.Mock;
    verifySignature: jest.Mock;
    encryptPayload: jest.Mock;
    decryptPayload: jest.Mock;
    mutation: {
        test: jest.Mock;
    };
}

// Extend global environment
declare global {
    var security: SecurityMock;
    var __REDIS__: RedisMock;
    var connection: jest.Mocked<Connection>;
    var cleanupMocks: () => Promise<void>;
    // Keep redis for backward compatibility
    var redis: RedisMock;
}

// Initialize security mock
global.security = {
    validateRequest: jest.fn(),
    generateNonce: jest.fn(),
    verifySignature: jest.fn(),
    encryptPayload: jest.fn(),
    decryptPayload: jest.fn(),
    mutation: {
        test: jest.fn()
    }
};

// Jest hooks for setup and teardown
beforeAll(async () => {
    // Only create Redis if not already initialized
    if (!global.__REDIS__) {
        const redisMock = new RedisMock({
            keyPrefix: 'test:',
            enableOfflineQueue: true,
        });
        global.__REDIS__ = redisMock;
        global.redis = redisMock; // For backward compatibility
        await redisMock.connect();
    }
});

afterAll(async () => {
    jest.useRealTimers();
    if (global.__REDIS__) {
        await global.__REDIS__.quit();
        delete global.__REDIS__;
        delete global.redis;
    }
});

beforeEach(async () => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    if (global.__REDIS__) {
        await global.__REDIS__.flushall();
        await global.__REDIS__.set('requests:default', '0');
        await global.__REDIS__.set('requests:governance', '0');
    }
});

afterEach(async () => {
    jest.clearAllMocks();
    if (global.__REDIS__) {
        await global.__REDIS__.flushall();
    }
});

global.cleanupMocks = async () => {
    jest.clearAllMocks();
    if (global.__REDIS__) {
        try {
            await global.__REDIS__.flushall();
            await global.__REDIS__.quit();
        } catch (error) {
            console.warn('Failed to cleanup Redis in cleanupMocks:', error);
        }
    }
};

process.on('exit', () => {
    if (global.__REDIS__?.status === 'ready') {
        try {
            global.__REDIS__.quit();
        } catch (error) {
            console.error('Failed to cleanup Redis on exit:', error);
        }
    }
});
