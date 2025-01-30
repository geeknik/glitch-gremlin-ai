import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { GlitchSDK, TestType } from '../index.js';
import { 
    Keypair, 
    Connection, 
    PublicKey,
    Commitment,
    Transaction,
    TransactionInstruction,
    RpcResponseAndContext,
    SignatureResult,
    TransactionConfirmationStrategy,
    SendOptions,
    Signer,
    VersionedTransaction,
    SimulateTransactionConfig,
    GetBalanceConfig,
    SimulatedTransactionResponse
} from '@solana/web3.js';
import type { Redis } from 'ioredis';
import { GlitchError, ErrorCode } from '../errors.js';
import type { GovernanceConfig, ChaosRequestParams, SDKConfig } from '../types.js';
import { RedisQueueWorkerImpl } from '../queue/redis-worker.js';
import { GovernanceManager } from '../governance.js';
import type { MockInstance } from 'jest-mock';
import { BN } from 'bn.js';
import { ProposalState } from '../types.js';
import './helpers/redis-mock.js';
import { RedisQueueWorker, ChaosRequest, TestResult } from '../types.js';

// Mock Redis
jest.mock('ioredis', () => require('ioredis-mock'));

// Define default governance config for tests
const defaultGovernanceConfig: GovernanceConfig = {
    minStakeAmount: 1_000_000,
    maxStakeAmount: 1_000_000_000,
    minUnstakeAmount: 1_000_000,
    maxUnstakeAmount: 1_000_000_000,
    minProposalStake: 5_000_000,
    quorumPercentage: 10,
    votingPeriod: 259200,
    executionDelay: 86400,
    proposalThreshold: 5_000_000,
    quorum: 10,
    programId: new PublicKey('11111111111111111111111111111111'),
    treasuryAddress: new PublicKey('11111111111111111111111111111111'),
    voteWeights: {
        yes: 1,
        no: 1,
        abstain: 0
    },
    rewardRate: 0.01,
    earlyUnstakePenalty: 0.1,
    minStakeDuration: 86400,
    maxStakeDuration: 31536000,
    proposalExecutionThreshold: 60,
    proposalCooldownPeriod: 86400,
    stakeLockupPeriod: 604800
};

// Initialize test state
let mockRedis: Redis;
let redisQueueWorker: RedisQueueWorkerImpl;
let sdk: GlitchSDK;

describe('GlitchSDK', () => {
    beforeEach(async () => {
        // Create Redis client mock
        const Redis = require('ioredis');
        mockRedis = new Redis();

        // Create RedisQueueWorker instance
        redisQueueWorker = new RedisQueueWorkerImpl(mockRedis);
        await redisQueueWorker.initialize();

        // Create SDK instance
        const wallet = Keypair.generate();
        const config: SDKConfig = {
            cluster: 'devnet',
            wallet,
            programId: '11111111111111111111111111111111',
            governanceConfig: defaultGovernanceConfig
        };

        sdk = await GlitchSDK.create(config);

        // Create a Connection instance and mock its methods
        const mockConnection = new Connection('http://localhost:8899');
        
        // Mock the methods using spyOn
        jest.spyOn(mockConnection, 'getLatestBlockhash').mockImplementation(async () => ({
            blockhash: 'mock-blockhash',
            lastValidBlockHeight: 9999
        }));
        
        jest.spyOn(mockConnection, 'getBalance').mockImplementation(async () => 200_000_000);
        
        jest.spyOn(mockConnection, 'simulateTransaction').mockImplementation(async () => ({
            context: { slot: 0 },
            value: {
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        }));
        
        jest.spyOn(mockConnection, 'sendTransaction').mockImplementation(async () => 'mock-signature');
        
        jest.spyOn(mockConnection, 'confirmTransaction').mockImplementation(async () => ({
            context: { slot: 0 },
            value: { err: null }
        }));

        // Set the mocked connection
        Object.defineProperty(sdk, 'connection', {
            value: mockConnection,
            writable: true
        });

        // Set queue worker
        Object.defineProperty(sdk, 'queueWorker', {
            value: redisQueueWorker,
            writable: true
        });
    });

    afterEach(async () => {
        await redisQueueWorker.close();
        jest.clearAllMocks();
    });

    // ... rest of the test cases ...
});
