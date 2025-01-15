// Configure Jest for ESM
const { TextDecoder, TextEncoder } = require('util');

// Mock globals that Node doesn't provide
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

// Security testing utilities
global.security = {
  // Mock security metrics collector
  metrics: {
    collect: jest.fn().mockResolvedValue({}),
    stop: jest.fn().mockResolvedValue({})
  },
  
  
  // Mock vulnerability scanner
  scanner: {
    scan: jest.fn().mockImplementation(async (target) => ({
      vulnerabilities: [],
      metrics: {
        executionTime: 0,
        resourceUsage: {
          cpu: 0,
          memory: 0
        }
      }
    }))
  },
  
  // Mock fuzz tester
  fuzz: {
    test: jest.fn().mockImplementation(async (target, params) => ({
      totalExecutions: 0,
      uniqueCrashes: 0,
      codeCoverage: 0,
      newPaths: 0
    }))
  },

  // Mock SDK validation
  validateRequest: jest.fn().mockImplementation((params) => {
    if (!params) throw new Error('Missing parameters');
    
    if (params.duration < 60 || params.duration > 3600) {
      throw new Error('Duration must be between 60 and 3600 seconds');
    }
    if (params.intensity < 1 || params.intensity > 10) {
      throw new Error('Intensity must be between 1 and 10');
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(params.targetProgram)) {
      throw new Error('Invalid program ID format');
    }
    return true;
  }),
  
  // Mock mutation tester
  mutation: {
    test: jest.fn().mockImplementation(async (target, params) => ({
      totalMutations: 0,
      killedMutations: 0,
      survivedMutations: 0,
      coverage: 0
    }))
  }
};

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
process.env.REDIS_URL = 'redis://r.glitchgremlin.ai:6379';
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

