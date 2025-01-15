import { Connection } from '@solana/web3.js'
import RedisMock from './__mocks__/ioredis'
import { jest } from '@jest/globals'

interface SecurityMock {
    validateRequest: jest.Mock
    generateNonce: jest.Mock
    verifySignature: jest.Mock
    encryptPayload: jest.Mock
    decryptPayload: jest.Mock
}

// Extend global environment
declare global {
    var security: SecurityMock;
    var redis: RedisMock;
    var connection: jest.Mocked<Connection>;
    var cleanupMocks: () => Promise<void>;
}

// Initialize security mock
global.security = {
validateRequest: jest.fn(),
generateNonce: jest.fn(),
verifySignature: jest.fn(),
encryptPayload: jest.fn(),
decryptPayload: jest.fn()
}

// Setup fake timers
jest.useFakeTimers()

// Initialize Redis mock
global.redis = new RedisMock({
    keyPrefix: 'test:'
})
// Initialize Solana connection mock
// Initialize Solana connection mock  
global.connection = {
    getAccountInfo: jest.fn(),
    getBalance: jest.fn(), 
    getRecentBlockhash: jest.fn(),
    sendTransaction: jest.fn(),
    confirmTransaction: jest.fn(),
    getVersion: jest.fn()
} as unknown as jest.Mocked<Connection>
// Add cleanup hooks
beforeEach(() => {
    // Reset all mock implementations
    jest.clearAllMocks()
    jest.useFakeTimers()

    // Reset Redis mock state
    if (global.redis) {
        global.redis.flushall()
    }
})

afterEach(async () => {
    // Clean up mocks
    jest.clearAllMocks()

    // Clean up Redis
    if (global.redis) {
        await global.redis.flushall()
    }

    // Clean up timers
    jest.runOnlyPendingTimers()
    jest.useRealTimers()

    // Run cleanup handlers
    if (global.cleanupMocks) {
        await global.cleanupMocks()
    }
})

// Initialize cleanup handler
global.cleanupMocks = async () => {
    if (global.redis) {
        await global.redis.quit()
    }
}

export { security }
