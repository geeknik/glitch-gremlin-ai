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

// Mock TensorFlow.js
jest.mock('@tensorflow/tfjs-node', () => ({
    sequential: jest.fn(() => ({
        add: jest.fn(),
        compile: jest.fn(),
        fit: jest.fn().mockResolvedValue({
            history: {
                loss: [0.5],
                acc: [0.8],
                val_loss: [0.6],
                val_acc: [0.75]
            }
        }),
        predict: jest.fn().mockReturnValue({
            data: jest.fn().mockResolvedValue(new Float32Array([0.8])),
            dispose: jest.fn()
        }),
        dispose: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
        loadLayersModel: jest.fn().mockResolvedValue({
            layers: [],
            compile: jest.fn(),
            fit: jest.fn(),
            predict: jest.fn(),
            dispose: jest.fn()
        })
    })),
    layers: {
        dense: jest.fn().mockReturnValue({})
    },
    train: {
        adam: jest.fn()
    },
    tensor2d: jest.fn().mockReturnValue({
        dispose: jest.fn()
    })
}));

// Mock fs promises
jest.mock('fs/promises', () => ({
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue('{"version":"1.0.0"}'),
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined)
}));

// Mock Redis
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        quit: jest.fn().mockResolvedValue('OK'),
        on: jest.fn(),
        status: 'ready'
    }));
});

// Mock Solana Web3.js
jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn().mockImplementation(() => ({
        getAccountInfo: jest.fn().mockResolvedValue(null),
        getBalance: jest.fn().mockResolvedValue(1000000),
        getRecentBlockhash: jest.fn().mockResolvedValue({
            blockhash: '123',
            feeCalculator: { lamportsPerSignature: 5000 }
        }),
        sendTransaction: jest.fn().mockResolvedValue('tx-signature')
    })),
    PublicKey: jest.fn().mockImplementation((key) => ({
        toString: () => key,
        toBase58: () => key
    })),
    Keypair: {
        generate: jest.fn().mockReturnValue({
            publicKey: { toString: () => 'mock-pubkey' },
            secretKey: new Uint8Array(32)
        })
    },
    SystemProgram: {
        programId: { toString: () => 'system-program' }
    }
}));

// Set up environment variables for testing
process.env.SOLANA_CLUSTER_URL = 'http://localhost:8899';
process.env.REDIS_URL = 'redis://r.glitchgremlin.ai:6379';
process.env.NODE_ENV = 'test';

// Global test configuration
jest.setTimeout(30000); // 30 second timeout

// Console mocks to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

