import { Connection, PublicKey } from '@solana/web3.js'
import { Redis } from 'ioredis'
import { jest } from '@jest/globals'
import IoRedisMock from 'ioredis'

// Extend global environment
declare global {
namespace NodeJS {
    interface Global {
    security: SecurityMock
    redis: IoRedisMock
    connection: jest.Mocked<Connection>
    cleanupMocks?: () => Promise<void>
    }
}
}

// Initialize security mock
global.security = {
validateRequest: jest.fn(),
generateNonce: jest.fn(),
verifySignature: jest.fn(),
encryptPayload: jest.fn(),
decryptPayload: jest.fn()
}

// Initialize IoRedisMock with default behaviors
global.redis = new IoRedisMock({
// Default Redis behaviors
data: new Map(),
keyPrefix: 'test:',
})

// Initialize Solana connection mock
global.connection = {
getAccountInfo: jest.fn(),
getBalance: jest.fn(),
getRecentBlockhash: jest.fn(),
sendTransaction: jest.fn(),
confirmTransaction: jest.fn(),
getVersion: jest.fn()
} as jest.Mocked<Redis>

// Add cleanup hooks
beforeEach(() => {
// Reset all mock implementations
jest.clearAllMocks()

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
    await global.redis.quit()
}

// Clean up any remaining timers
if (jest.getTimerCount()) {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
}

// Run any registered cleanup handlers
if (global.cleanupMocks) {
    await global.cleanupMocks()
}
})

export { security }
