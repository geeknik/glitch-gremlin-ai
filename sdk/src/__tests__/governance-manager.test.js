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
describe('Governance', () => {
  afterEach(async () => {
    // Reset Redis mock methods
    Object.values(mockMethods).forEach((mockFn) => {
      mockFn.mockClear();
    });
    // Reset all jest mocks
    jest.clearAllMocks();
    // Restore real timers
    jest.useRealTimers();
  });

  describe('proposal creation', () => {
    it('should validate minimum stake requirements', async () => {
      // Mock a low SOL balance
      mockConnection.getBalance.mockResolvedValue(50);

      // Make sure transaction simulation always succeeds
      mockConnection.simulateTransaction.mockResolvedValue({
        value: {
          err: null,
          logs: [],
          accounts: null,
          unitsConsumed: 0,
          returnData: null
        }
      });

      await expect(
        sdk.createProposal({
          title: 'Test Proposal',
          description: 'Test Description',
          targetProgram: '11111111111111111111111111111111',
          testParams: {
            testType: TestType.FUZZ,
            duration: 300,
            intensity: 5,
            targetProgram: '11111111111111111111111111111111'
          },
          stakingAmount: 10 // Too low
        })
      ).rejects.toThrow('Insufficient stake amount');
    });

    it('should enforce proposal rate limits', async () => {
      const validProposal = {
        title: 'Test Proposal',
        description: 'Test Description',
        targetProgram: '11111111111111111111111111111111',
        testParams: {
          testType: TestType.FUZZ,
          duration: 300,
          intensity: 5,
          targetProgram: '11111111111111111111111111111111'
        },
        stakingAmount: 1000
      };

      // Reset rate limits
      await global.__REDIS__.set('requests:governance', '0');

      // First proposal should succeed
      await expect(sdk.createProposal(validProposal)).resolves.not.toThrow();

      // Second and third proposals should fail
      await expect(sdk.createProposal(validProposal)).rejects.toThrow(
        'Rate limit exceeded'
      );
      await expect(sdk.createProposal(validProposal)).rejects.toThrow(
        'Rate limit exceeded'
      );

      // Verify that the rate counter only incremented once
      const rateCount = await global.__REDIS__.get('requests:governance');
      expect(parseInt(rateCount ?? '0')).toBe(1);
    });
  });

  describe('voting', () => {
    it('should require minimum token balance to vote', async () => {
      // Mock a low token balance
      mockConnection.getBalance.mockResolvedValueOnce(100);

      // Simulate a successful transaction
      mockConnection.simulateTransaction.mockResolvedValueOnce({
        context: { slot: 0 },
        value: {
          err: null,
          logs: [],
          accounts: null,
          unitsConsumed: 0,
          returnData: null
        }
      });

      await expect(sdk.vote('test-proposal-id', true)).rejects.toThrow(
        'Insufficient token balance to vote'
      );
    });

    it('should prevent double voting', async () => {
      // Mock enough balance
      mockConnection.getBalance.mockResolvedValue(2000);

      mockConnection.simulateTransaction.mockResolvedValue({
        context: { slot: 0 },
        value: {
          err: null,
          logs: [],
          accounts: null,
          unitsConsumed: 0,
          returnData: null
        }
      });

      mockConnection.sendTransaction.mockImplementation(async () => {
        return 'mock-signature';
      });

      // First vote call should succeed
      await sdk.vote('test-proposal-id', true);

      // Force hasVotedOnProposal to return true
      jest.spyOn(sdk as any, 'hasVotedOnProposal').mockResolvedValueOnce(true);

      // Second vote call should fail
      await expect(sdk.vote('test-proposal-id', false)).rejects.toThrow(
        'Already voted on this proposal'
      );

      // Cleanup
      mockConnection.getBalance.mockRestore();
      mockConnection.simulateTransaction.mockRestore();
      mockConnection.sendTransaction.mockRestore();
      jest.restoreAllMocks();
    });
  });

  describe('proposal execution', () => {
    it('should validate proposal status', async () => {
      // Return a "defeated" proposal
      mockConnection.getAccountInfo.mockImplementationOnce(() => {
        const mockData = {
          status: 'failed',
          state: ProposalState.Defeated,
          executed: false,
          voteWeights: { yes: 0, no: 100, abstain: 0 },
          quorum: 100,
          timeLockEnd: Date.now() - 1000,
          endTime: Date.now() - 86400000
        };
        const buffer = Buffer.alloc(392);
        Buffer.from(JSON.stringify(mockData)).copy(buffer);
        return Promise.resolve({
          data: buffer,
          executable: false,
          lamports: 0,
          owner: sdk['programId'],
          rentEpoch: 0
        });
      });

      // Ensure getProposalStatus aligns with the defeated status
      jest.spyOn(sdk, 'getProposalStatus').mockResolvedValueOnce({
        status: 'failed',
        state: 'Defeated',
        executed: false,
        voteWeights: { yes: 0, no: 100, abstain: 0 },
        quorum: 100
      } as any);

      await expect(
        sdk.executeProposal(new PublicKey(Keypair.generate().publicKey).toString())
      ).rejects.toThrow('Proposal not passed');
    });

    it('should enforce timelock period', async () => {
      const now = 1641024000000; // Fixed reference time
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      // Return a "succeeded" proposal but with an unelapsed timelock
      mockConnection.getAccountInfo.mockImplementationOnce(() => {
        const mockData = {
          status: 'succeeded',
          state: 'Succeeded',
          endTime: now - 86400000,
          executionTime: now + 172800000,
          timeLockEnd: now + 86400000, // Not yet elapsed
          voteWeights: { yes: 200, no: 50, abstain: 0 },
          quorum: 100,
          executed: false
        };
        const buffer = Buffer.alloc(392);
        Buffer.from(JSON.stringify(mockData)).copy(buffer);
        return Promise.resolve({
          data: buffer,
          executable: false,
          lamports: 1000000,
          owner: sdk['programId'],
          rentEpoch: 0
        });
      });

      const mockGetProposalStatus = jest
        .spyOn(sdk, 'getProposalStatus')
        .mockResolvedValueOnce({
          id: 'proposal-5678',
          status: 'succeeded',
          title: 'Test Proposal',
          description: 'Test Description',
          proposer: sdk['wallet'].publicKey.toString(),
          startTime: now - 86400000,
          endTime: now + 86400000,
          votes: {
            yes: 200,
            no: 50,
            abstain: 0
          },
          quorum: 100,
          stakedAmount: 1000,
          testParams: {
            targetProgram: '11111111111111111111111111111111',
            testType: TestType.FUZZ,
            duration: 300,
            intensity: 5
          },
          state: {
            isActive: true,
            isPassed: false,
            isExecuted: false,
            isExpired: false,
            canExecute: false,
            canVote: true,
            timeRemaining: 86400000
          }
        } as any);

      // Create a valid base58 proposal public key
      const proposalId = new PublicKey(Keypair.generate().publicKey);

      // One more mock to reaffirm timeLockEnd
      mockConnection.getAccountInfo.mockImplementationOnce(() => {
        const mockData = {
          status: 'succeeded',
          state: 'Succeeded',
          endTime: now - 86400000,
          executionTime: now + 172800000,
          timeLockEnd: now + 86400000,
          voteWeights: { yes: 200, no: 50, abstain: 0 },
          quorum: 100,
          executed: false
        };
        const buffer = Buffer.alloc(392);
        Buffer.from(JSON.stringify(mockData)).copy(buffer);
        return Promise.resolve({
          data: buffer,
          executable: false,
          lamports: 1000000,
          owner: sdk['programId'],
          rentEpoch: 0
        });
      });

      await expect(sdk.executeProposal(proposalId.toString())).rejects.toThrow(
        'Timelock period not elapsed'
      );

      mockGetProposalStatus.mockRestore();
    });

    it('should check quorum requirements', async () => {
      // Simulate a proposal that has not reached quorum
      const proposalState = {
        status: 'active',
        voteWeights: { yes: 400, no: 50, abstain: 0 },
        quorum: 1000,
        endTime: Date.now() + 86400000,
        executed: false,
        proposer: sdk['wallet'].publicKey.toString(),
        title: 'Test Proposal'.padEnd(64, ' '),
        description: 'Test Description'.padEnd(256, ' '),
        testParams: {
          testType: 1,
          duration: 300,
          intensity: 5,
          targetProgram: '11111111111111111111111111111111'
        }
      };
      const stateBuffer = Buffer.alloc(400);
      Buffer.from(JSON.stringify(proposalState)).copy(stateBuffer);

      mockConnection.getAccountInfo.mockImplementation(() => {
        return Promise.resolve({
          data: stateBuffer,
          executable: false,
          lamports: 0,
          owner: sdk['programId'],
          rentEpoch: 0
        });
      });

      const mockGetProposalStatus = jest
        .spyOn(sdk, 'getProposalStatus')
        .mockResolvedValueOnce({
          id: 'proposal-9012',
          status: 'succeeded',
          title: 'Test Proposal',
          description: 'Test Description',
          proposer: 'test-proposer',
          votes: { yes: 100, no: 50, abstain: 0 },
          startTime: Date.now() - 86400000,
          endTime: Date.now() - 86400000,
          quorum: 100,
          stakedAmount: 1000,
          testParams: {
            targetProgram: '11111111111111111111111111111111',
            testType: TestType.FUZZ,
            duration: 300,
            intensity: 5
          },
          state: {
            isActive: false,
            isPassed: false,
            isExecuted: false,
            isExpired: true,
            canExecute: false,
            canVote: false,
            timeRemaining: 0
          }
        } as any);

      const proposalId = new PublicKey(Keypair.generate().publicKey).toString();

      await expect(sdk.executeProposal(proposalId)).rejects.toThrow(
        'Proposal has not reached quorum'
      );

      mockGetProposalStatus.mockRestore();
    });
  });
});

// Ensure this file is treated as a module
export {};
