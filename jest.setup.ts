import { Connection } from '@solana/web3.js';
import RedisMock from './__mocks__/ioredis';
import { jest } from '@jest/globals';

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

        try {
            // Check current Redis state
            if (!['connected', 'ready'].includes(redisMock.status)) {
                await redisMock.connect();
                // Wait up to 5 seconds for Redis to be ready
                let attempts = 0;
                while (!['connected', 'ready'].includes(redisMock.status) && attempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }
                if (!['connected', 'ready'].includes(redisMock.status)) {
                    throw new Error('Redis failed to connect after 5 seconds');
                }
            }

            // Make Redis available globally
            global.__REDIS__ = redisMock;
            global.redis = redisMock; // For backward compatibility
        } catch (error) {
            console.error('Failed to initialize Redis:', error);
            throw error;
        }
    }
});

afterAll(async () => {
    try {
        // Clean up fake timers
        jest.useRealTimers();
        
        // Properly close Redis connection
        if (global.__REDIS__) {
            if (['ready', 'connected', 'connecting'].includes(global.__REDIS__.status)) {
                await global.__REDIS__.quit();
            }
            delete global.__REDIS__;
            delete global.redis;
        }
    } catch (error) {
        console.error('Failed to cleanup in afterAll:', error);
    }
});

// Connection mock is imported from governance-manager.test.ts
// No need to initialize it here anymore
// Add cleanup hooks
beforeEach(async () => {
    // Reset all mock implementations
    jest.resetAllMocks();
    jest.restoreAllMocks();
    
    // Reset Redis mock state if it exists and is ready/connected
    if (global.__REDIS__ && ['ready', 'connected'].includes(global.__REDIS__.status)) {
        try {
            await global.__REDIS__.flushall();
            await global.__REDIS__.set('requests:default', '0');
            await global.__REDIS__.set('requests:governance', '0');
        } catch (error) {
            console.warn('Failed to reset Redis in beforeEach:', error);
            throw error;
        }
    }
});

afterEach(async () => {
    try {
        // Clean up mocks
        jest.clearAllMocks();
        
        // Clean up Redis if connected
        if (global.__REDIS__ && ['ready', 'connected'].includes(global.__REDIS__.status)) {
            await global.__REDIS__.flushall();
        }
        
        // Run cleanup handlers
        if (global.cleanupMocks) {
            await global.cleanupMocks();
        }
    } catch (error) {
        console.warn('Cleanup in afterEach failed:', error);
    }
});

// Initialize cleanup handler
// Initialize cleanup handler with comprehensive mock and connection cleanup
global.cleanupMocks = async () => {
    const errors = [];
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Clean up Redis
    if (global.__REDIS__) {
        try {
            if (['ready', 'connected'].includes(global.__REDIS__.status)) {
                await global.__REDIS__.flushall();
                await global.__REDIS__.quit();
            }
        } catch (error) {
            errors.push(['Redis cleanup error:', error]);
        }
    }

    // Log any errors that occurred during cleanup
    if (errors.length > 0) {
        errors.forEach(([message, error]) => console.warn(message, error));
    }
};

// Cleanup handler for unexpected process termination
process.on('exit', () => {
    if (global.__REDIS__?.status === 'ready') {
        // Use sync operations since async won't work in exit handler
        try {
            global.__REDIS__.quit();
        } catch (error) {
            console.error('Failed to cleanup Redis on exit:', error);
        }
    }
});
