/**
 * test/governance.test.ts
 *
 * This file includes:
 *  - A globally declared mockMethods reference for Redis.
 *  - A global declaration for __REDIS__ on the NodeJS.Global interface.
 *  - Removal of unused imports (TransactionInstruction, ErrorCode, GlitchError).
 *  - Consolidation of repeated comments.
 *  - Proper scoping of mockMethods so that afterEach can reset them.
 *  - Minor cleanup for clarity.
 */

import { jest } from '@jest/globals';
import { GlitchSDK, TestType, ProposalState } from '../index.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import Redis from 'ioredis-mock';
import { GovernanceManager } from '../governance-manager.js';

// Add __REDIS__ to the global scope
globalThis.__REDIS__ = undefined;

/** @type {Record<string, import('@jest/globals').Mock<Promise<any>>} */
let mockMethods;

/**
 * @typedef {import('@jest/globals').Mock & {
 *   mockResolvedValue: (value: any) => SolanaJestMock,
 *   mockResolvedValueOnce: (value: any) => SolanaJestMock
 * }} SolanaJestMock
 */

/**
 * @typedef {Object} IMockConnection
 * @property {SolanaJestMock} getAccountInfo
 * @property {SolanaJestMock} getBalance
 * @property {SolanaJestMock} getRecentBlockhash
 * @property {SolanaJestMock} sendTransaction
 * @property {SolanaJestMock} confirmTransaction
 * @property {SolanaJestMock} simulateTransaction
 * @property {SolanaJestMock} getVersion
 * @property {SolanaJestMock} getParsedTokenAccountsByOwner
 */

// A connection mock for Solana
class MockConnection implements IMockConnection {
  getAccountInfo = jest.fn().mockImplementation(() => Promise.resolve(null));
  getBalance = jest.fn().mockImplementation(() => Promise.resolve(1000000));
  getRecentBlockhash = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve({
        blockhash: '1111111111111111111111111111',
        lastValidBlockHeight: 9999999
      })
    );
  sendTransaction = jest
    .fn()
    .mockImplementation(() => Promise.resolve('mock-signature'));
  confirmTransaction = jest
    .fn()
    .mockImplementation(() => Promise.resolve({ value: { err: null } }));
  simulateTransaction = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve({
        value: {
          err: null,
          logs: [],
          accounts: null,
          unitsConsumed: 0,
          returnData: null
        }
      })
    );
  getVersion = jest
    .fn()
    .mockImplementation(() => Promise.resolve({ 'solana-core': '1.0.0' }));
  getParsedTokenAccountsByOwner = jest
    .fn()
    .mockImplementation(() => Promise.resolve({ value: [] }));

  clearMocks(): void {
    [
      this.getAccountInfo,
      this.getBalance,
      this.getRecentBlockhash,
      this.sendTransaction,
      this.confirmTransaction,
      this.simulateTransaction,
      this.getVersion,
      this.getParsedTokenAccountsByOwner
    ].forEach((mock) => {
      mock.mockClear();
      mock.mockReset();
      mock.mockImplementation(() => Promise.resolve(null));
    });

    // Re-establish default resolved values
    this.getAccountInfo.mockResolvedValue(null);
    this.getBalance.mockResolvedValue(1000000);
    this.getRecentBlockhash.mockResolvedValue({
      blockhash: '1111111111111111111111111111',
      lastValidBlockHeight: 9999999
    });
    this.sendTransaction.mockResolvedValue('mock-signature');
    this.confirmTransaction.mockResolvedValue({ value: { err: null } });
    this.simulateTransaction.mockResolvedValue({
      value: {
        err: null,
        logs: [],
        accounts: null,
        unitsConsumed: 0,
        returnData: null
      }
    });
    this.getVersion.mockResolvedValue({ 'solana-core': '1.0.0' });
    this.getParsedTokenAccountsByOwner.mockResolvedValue({ value: [] });
  }
}

// Global test variables
let sdk: GlitchSDK;
let mockConnection: MockConnection;
let redis: Redis;

// Set up before all tests
beforeAll(async () => {
  // Prepare a Redis mock instance
  const redisMock = new Redis({
    data: {
      'requests:governance': '0',
      'requests:default': '0'
    },
    enableOfflineQueue: true,
    lazyConnect: true,
    keyPrefix: 'test:'
  });

  // Define the mock methods we will attach to redisMock
  mockMethods = {
    get: jest.fn().mockImplementation(async (key: string) => {
      if (key === 'requests:governance') return '0';
      return null;
    }),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockImplementation(async (key: string) => {
      const val = (await mockMethods.get(key)) || '0';
      const newVal = (parseInt(val) + 1).toString();
      await mockMethods.set(key, newVal);
      return parseInt(newVal);
    }),
    expire: jest.fn().mockResolvedValue(1),
    flushall: jest.fn().mockResolvedValue('OK'),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockImplementation(async () => {
      redisMock.status = 'ready';
      redisMock.connected = true;
      return Promise.resolve();
    })
  };

  // Attach all jest.fn() methods to the Redis mock instance
  Object.assign(redisMock, mockMethods);

  // Set initial state
  redisMock.status = 'ready';
  redisMock.connected = true;
  global.__REDIS__ = redisMock;

  // Assign to our local variable
  redis = redisMock;

  // Initialize the Redis connection
  await redis.connect();

  // Use fake timers for these tests
  jest.useFakeTimers();
});

// Set up before each test
beforeEach(async () => {
  jest.clearAllMocks();
  mockConnection = new MockConnection();
  const wallet = Keypair.generate();

  // Ensure Redis is connected
  if (!redis.connected) {
    await redis.connect();
  }

  sdk = await GlitchSDK.create({
    cluster: 'https://api.devnet.solana.com',
    wallet,
    heliusApiKey: 'test-api-key',
    redis,
    connection: mockConnection as unknown as Connection
  });

  // Reset counters in Redis
  await redis.flushall();
  await redis.set('requests:default', '0');
  await redis.set('requests:governance', '0');

  // Reset some mock implementations with scenario-specific defaults
  mockConnection.simulateTransaction.mockImplementation(async () => ({
    context: { slot: 0 },
    value: {
      err: null,
      logs: ['Program execution succeeded'],
      accounts: null,
      unitsConsumed: 0,
      returnData: null
    }
  }));
  mockConnection.sendTransaction.mockImplementation(async () => 'mock-signature');
});

// Main Governance test block
describe('GovernanceManager', () => {
  let manager;
  let wallet;

  beforeEach(() => {
    wallet = Keypair.generate();
    
    // Create mock connection
    mockConnection = {
      getAccountInfo: jest.fn().mockResolvedValue(null),
      getBalance: jest.fn().mockResolvedValue(1000000),
      getRecentBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mock-blockhash',
        feeCalculator: { lamportsPerSignature: 5000 }
      }),
      sendTransaction: jest.fn().mockResolvedValue('mock-signature'),
      getProgramAccounts: jest.fn().mockResolvedValue([])
    };

    manager = new GovernanceManager({
      connection: mockConnection,
      wallet,
      programId: 'mock-program-id',
      minStakeAmount: 1000,
      minVotingPeriod: 86400,
      maxVotingPeriod: 604800
    });
  });

  describe('proposal creation', () => {
    it('should validate minimum stake requirements', async () => {
      mockConnection.getBalance.mockResolvedValueOnce(500);
      
      await expect(manager.createProposal({
        title: 'Test Proposal',
        description: 'Test Description',
        chaosParams: {
          type: 'ARITHMETIC_OVERFLOW',
          duration: 300,
          intensity: 5
        }
      })).rejects.toThrow('Insufficient stake amount');
    });

    it('should create valid proposal', async () => {
      const proposal = await manager.createProposal({
        title: 'Test Proposal',
        description: 'Test Description',
        chaosParams: {
          type: 'ARITHMETIC_OVERFLOW',
          duration: 300,
          intensity: 5
        }
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe('PENDING');
      expect(mockConnection.sendTransaction).toHaveBeenCalled();
    });

    it('should enforce proposal rate limits', async () => {
      // Create first proposal
      await manager.createProposal({
        title: 'First Proposal',
        description: 'Test',
        chaosParams: { type: 'ARITHMETIC_OVERFLOW', duration: 300, intensity: 5 }
      });

      // Attempt second proposal immediately
      await expect(manager.createProposal({
        title: 'Second Proposal',
        description: 'Test',
        chaosParams: { type: 'ARITHMETIC_OVERFLOW', duration: 300, intensity: 5 }
      })).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('voting', () => {
    let proposalId;

    beforeEach(async () => {
      const proposal = await manager.createProposal({
        title: 'Test Proposal',
        description: 'Test Description',
        chaosParams: { type: 'ARITHMETIC_OVERFLOW', duration: 300, intensity: 5 }
      });
      proposalId = proposal.id;
    });

    it('should require minimum token balance to vote', async () => {
      mockConnection.getBalance.mockResolvedValueOnce(0);
      
      await expect(manager.vote(proposalId, true))
        .rejects.toThrow('Insufficient token balance');
    });

    it('should prevent double voting', async () => {
      await manager.vote(proposalId, true);
      
      await expect(manager.vote(proposalId, true))
        .rejects.toThrow('Already voted');
    });

    it('should record vote correctly', async () => {
      await manager.vote(proposalId, true);
      
      const proposal = await manager.getProposal(proposalId);
      expect(proposal.votes.for).toBe(1);
      expect(proposal.votes.against).toBe(0);
    });
  });

  describe('proposal execution', () => {
    it('should only execute passed proposals', async () => {
      const proposal = await manager.createProposal({
        title: 'Test Proposal',
        description: 'Test Description',
        chaosParams: { type: 'ARITHMETIC_OVERFLOW', duration: 300, intensity: 5 }
      });

      await expect(manager.executeProposal(proposal.id))
        .rejects.toThrow('Proposal not passed');
    });

    it('should enforce timelock period', async () => {
      const proposal = await manager.createProposal({
        title: 'Test Proposal',
        description: 'Test Description',
        chaosParams: { type: 'ARITHMETIC_OVERFLOW', duration: 300, intensity: 5 }
      });

      // Vote to pass
      await manager.vote(proposal.id, true);
      
      await expect(manager.executeProposal(proposal.id))
        .rejects.toThrow('Timelock period not elapsed');
    });
  });
});

// Ensure this file is treated as a module
export {};
