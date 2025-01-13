// Configure Jest for ESM
const { TextDecoder, TextEncoder } = require('util');

// Mock globals that Node doesn't provide
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

// Mock Solana packages
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getProgramAccounts: jest.fn().mockResolvedValue([]),
    getRecentBlockhash: jest.fn().mockResolvedValue({
      blockhash: 'mock-blockhash',
      feeCalculator: { lamportsPerSignature: 5000 }
    }),
    confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
    getSignatureStatus: jest.fn().mockResolvedValue({ value: { err: null } }),
    sendTransaction: jest.fn().mockResolvedValue('mock-signature')
  })),
  PublicKey: jest.fn().mockImplementation((key) => ({
    toString: () => key,
    toBase58: () => key,
    toBuffer: () => Buffer.from(key)
  })),
  Keypair: {
    generate: jest.fn().mockReturnValue({
      publicKey: { toBase58: () => 'mock-pubkey' },
      secretKey: new Uint8Array(32)
    })
  },
  SystemProgram: {
    programId: { toString: () => 'mock-system-program' }
  },
  Transaction: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    sign: jest.fn(),
    serialize: jest.fn()
  }))
}));

// Set up environment variables for testing
process.env.SOLANA_CLUSTER_URL = 'http://localhost:8899';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// Configure Jest environment
jest.setTimeout(10000); // 10 second timeout

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
};

