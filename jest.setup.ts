import { Connection, PublicKey } from '@solana/web3.js'
import { Redis } from 'ioredis'
import { jest } from '@jest/globals'

// Extend global environment
declare global {
namespace NodeJS {
    interface Global {
    security: SecurityMock
    redis: jest.Mocked<Redis> 
    connection: jest.Mocked<Connection>
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

// Initialize redis mock
global.redis = {
incr: jest.fn(),
expire: jest.fn(),
get: jest.fn(),
set: jest.fn(),
del: jest.fn(),
exists: jest.fn(),
keys: jest.fn(),
quit: jest.fn(),
disconnect: jest.fn(),
connect: jest.fn(),
subscribe: jest.fn(),
publish: jest.fn(),
unsubscribe: jest.fn()
} as jest.Mocked<Redis>

// Initialize Solana connection mock
global.connection = {
getAccountInfo: jest.fn(),
getBalance: jest.fn(),
getRecentBlockhash: jest.fn(),
sendTransaction: jest.fn(),
confirmTransaction: jest.fn(),
getVersion: jest.fn()
} as jest.Mocked<Redis>

export { security }

