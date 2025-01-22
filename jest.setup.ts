import { Connection } from '@solana/web3.js';
import RedisMock from './__mocks__/ioredis';
import { jest } from '@jest/globals';
import type { TensorFlowMock } from '../__mocks__/@tensorflow/tfjs-node';
import cryptoRandomString from 'crypto-random-string';

declare global {
    var tf: TensorFlowMock; 
}

// Create type-safe mock implementation
const mockTf = {
    sequential: jest.fn().mockImplementation(() => ({
        add: jest.fn().mockReturnThis(),
        compile: jest.fn().mockReturnThis(),
        predict: jest.fn().mockResolvedValue({
            dataSync: () => [0],
            dispose: jest.fn()
        }),
        summary: jest.fn(),
        dispose: jest.fn(),
        getWeights: jest.fn().mockReturnValue([]),
        setWeights: jest.fn(),
        trainOnBatch: jest.fn().mockResolvedValue(0),
        layers: [],
        optimizer: {},
        name: 'mocked-model'
    })),
    layers: {
        dense: jest.fn().mockImplementation((config: any) => ({
          apply: jest.fn().mockReturnValue(tf.tensor2d([[0]])),
          getConfig: jest.fn().mockReturnValue(config),
          build: jest.fn()
        })),
        dropout: jest.fn().mockReturnValue({})
    },
    losses: {
        meanSquaredError: jest.fn().mockReturnValue({})
    },
    train: {
        adam: jest.fn().mockReturnValue({})
    },
    tensor: jest.fn().mockReturnValue({}),
    loadLayersModel: jest.fn().mockResolvedValue({
        predict: jest.fn().mockResolvedValue([]),
        compile: jest.fn(),
        fit: jest.fn(),
        summary: jest.fn()
    })
};

// Export the mock for direct imports
export const tf = mockTf;

// Assign to global for access in tests
global.tf = mockTf;

// Declare global tf type
declare global {
    var tf: typeof mockTf;
}

// Add the missing utility function to the mock
const mockTfWithUtils = {
    ...mockTf,
    util: {
        isNullOrUndefined: (value: any) => value === null || value === undefined
    }
};

// Mock the module with updated implementation
jest.mock('@tensorflow/tfjs-node', () => ({
    __esModule: true,
    ...mockTfWithUtils,
}));

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
    generateNonce: jest.fn().mockImplementation(() => cryptoRandomString({length: 16})),
    verifySignature: jest.fn().mockReturnValue(true),
    encryptPayload: jest.fn().mockImplementation((payload) => Buffer.from(JSON.stringify(payload)).toString('base64')),
    decryptPayload: jest.fn().mockImplementation((payload) => JSON.parse(Buffer.from(payload, 'base64').toString())),
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
    // Clean up tf mock
    delete global.tf;
    jest.unmock('@tensorflow/tfjs-node');
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
