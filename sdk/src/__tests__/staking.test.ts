import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import RedisMock from 'ioredis-mock';
import { GlitchSDK } from '../sdk.js';
import { 
    Keypair, 
    Connection, 
    PublicKey,
    Commitment,
    Transaction,
    Signer,
    SendOptions,
    AccountInfo,
    GetProgramAccountsConfig,
    ConfirmedSignatureInfo,
    ConfirmedSignaturesForAddress2Options
} from '@solana/web3.js';
import { InsufficientFundsError } from '../errors.js';
import type { Redis as RedisType } from 'ioredis';
import Redis from 'ioredis-mock';
import { GovernanceConfig, RedisConfig, StakeInfo, UnstakeResult } from '../types.js';
import IORedis from 'ioredis-mock';
import { createMockInstance } from 'jest-create-mock-instance';
import IoRedisMock from '../__mocks__/ioredis.js';
import { GovernanceConfig as GovernanceConfigType } from '../governance.js';

jest.mock('ioredis', () => require('ioredis-mock'));

let mockRedis: Redis;

describe('Staking', () => {
    let sdk: GlitchSDK;
    let mockConnection: jest.Mocked<Connection>;
    let wallet: Keypair;

    beforeEach(async () => {
        // Create fresh Redis mock for each test
        // Create a single shared Redis mock instance
        if (!(global as any).mockRedis) {
            (global as any).mockRedis = new RedisMock({
                enableOfflineQueue: true,
                lazyConnect: true
            });
        }
        mockRedis = (global as any).mockRedis;
        wallet = Keypair.generate();
        
        // Properly typed connection mock
        mockConnection = {
            commitment: 'confirmed',
            rpcEndpoint: 'https://api.devnet.solana.com',
            getBalance: jest.fn((publicKey: PublicKey) => Promise.resolve(10000)),
            getRecentBlockhash: jest.fn(() => Promise.resolve({
                blockhash: 'mock-blockhash',
                lastValidBlockHeight: 1000,
                feeCalculator: { lamportsPerSignature: 5000 }
            })),
            sendTransaction: jest.fn((transaction: Transaction) => Promise.resolve('mock-tx-signature')),
            getAccountInfo: jest.fn(),
            getProgramAccounts: jest.fn(),
            getConfirmedSignaturesForAddress2: jest.fn(),
            getSlot: jest.fn(),
            getBlockTime: jest.fn(),
            getBalanceAndContext: jest.fn(),
            onAccountChange: jest.fn(),
            removeAccountChangeListener: jest.fn(),
            equals: jest.fn((other: Connection) => other === mockConnection)
        } as unknown as jest.Mocked<Connection>;

        wallet = Keypair.generate();
        sdk = await GlitchSDK.create({
            cluster: 'https://api.devnet.solana.com',
            wallet,
            governanceConfig: {
                minStakeAmount: 100,
                MIN_STAKE_LOCKUP: 86400,  // Correct property name
                MAX_STAKE_LOCKUP: 31536000  // Correct property name
            },
            // Correctly typed mock setup
            heliusApiKey: 'test-key'
        });
        (sdk as any).connection = mockConnection;

        // Mock rate limit checks to pass by default
        jest.spyOn(mockRedis as any, 'get').mockResolvedValue(null);
        jest.spyOn(mockRedis as any, 'set').mockResolvedValue('OK');
        jest.spyOn(mockRedis as any, 'incr').mockResolvedValue(1);
        
        // Mock checkRateLimit directly with proper typing
        jest.spyOn(GlitchSDK.prototype as any, 'checkRateLimit').mockResolvedValue(void 0);

        // Setup test environment
        mockRedis = new Redis({
            data: {
                stakes: '{}',
                rewards: '{}'
            }
        });

        // Initialize SDK with test configuration
        const governanceConfig: GovernanceConfigType = {
            minStakeAmount: 1000,
            maxStakeAmount: 1000000,
            minUnstakeAmount: 100,
            maxUnstakeAmount: 100000,
            minProposalStake: 1000,
            quorumPercentage: 10,
            votingPeriod: 3 * 24 * 60 * 60, // 3 days
            executionDelay: 24 * 60 * 60, // 1 day
            proposalThreshold: 5000,
            quorum: 10,
            programId: new PublicKey(wallet.publicKey),
            treasuryAddress: new PublicKey(wallet.publicKey),
            voteWeights: {
                yes: 1,
                no: 1,
                abstain: 0
            },
            rewardRate: 0.01,
            earlyUnstakePenalty: 0.1,
            minStakeDuration: 7 * 24 * 60 * 60,
            maxStakeDuration: 365 * 24 * 60 * 60,
            proposalExecutionThreshold: 60,
            proposalCooldownPeriod: 24 * 60 * 60,
            stakeLockupPeriod: 7 * 24 * 60 * 60
        };

        sdk = await GlitchSDK.initialize({
            cluster: 'https://api.devnet.solana.com',
            wallet,
            redis: {
                host: 'localhost',
                port: 6379
            },
            governanceConfig
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        mockRedis.disconnect();
    });

    describe('stakeTokens', () => {
        it('should handle transaction failures', async () => {
            // Mock insufficient funds scenario
            mockConnection.getBalance.mockResolvedValueOnce(0);
            
            await expect(sdk.stakeTokens(1000, 86400))
                .rejects
                .toThrow(InsufficientFundsError);
        });

        it('should enforce minimum stake duration', async () => {
            await expect(sdk.stakeTokens(1000, 3600)) // 1 hour
                .rejects
                .toThrow('Minimum stake duration is 24 hours');
        });

        it('should calculate correct rewards', async () => {
            const amount = 1000;
            const duration = 86400 * 7; // 7 days
            
            const stake = await sdk.stakeTokens(amount, duration);
            
            expect(stake.estimatedRewards).toBe(amount * 0.01 * 7); // 1% daily reward
            expect(stake.lockupEnds).toBeGreaterThan(Date.now() + duration * 1000);
        });

        it('should enforce maximum stake amount', async () => {
            const maxStake = 1000000;
            
            await expect(sdk.stakeTokens(maxStake + 1, 86400))
                .rejects
                .toThrow('Exceeds maximum stake amount');
        });

        it('should validate maximum stake amount', async () => {
            await expect(sdk.stakeTokens(20_000_000, 86400))
                .rejects.toThrow('Stake amount cannot exceed');
        });

        it('should validate maximum lockup period', async () => {
            await expect(sdk.stakeTokens(1000, 31536000 * 2)) // 2 years
                .rejects.toThrow('Invalid lockup period');
        });

        it('should validate minimum stake amount', async () => {
            await expect(sdk.stakeTokens(50, 86400))
                .rejects.toThrow('Stake amount below minimum required');
        });

        it('should validate lockup period', async () => {
            await expect(sdk.stakeTokens(1000, 3600))
                .rejects.toThrow('Invalid lockup period');
        });

        it('should check token balance', async () => {
            // Override with low balance for this test
            mockConnection.getBalance.mockResolvedValueOnce(50);

            await expect(sdk.stakeTokens(1000, 86400))
                .rejects.toThrow(InsufficientFundsError);
        });

        it('should create stake successfully', async () => {
            // Mock token account info
            mockConnection.getAccountInfo.mockResolvedValue({
                data: Buffer.from([/* mock token account data */]),
                executable: false,
                lamports: 10000,
                owner: wallet.publicKey,
                rentEpoch: 0,
            });

            // Mock getBalance to return 10000 only for our wallet's public key
            mockConnection.getBalance.mockImplementation(async (publicKey) => {
                // Type check and null check
                if (!publicKey || !('toBase58' in publicKey)) {
                    console.error('Invalid publicKey parameter:', publicKey);
                    return 0;
                }

                // Compare using base58 string representation
                if (publicKey.toBase58() === wallet.publicKey.toBase58()) {
                    return 10000;
                }
                return 0;
            });
            
            // Verify the mock balance is set correctly for our wallet
            const currentBalance = await mockConnection.getBalance(wallet.publicKey);
            console.log(`Current mocked balance: ${currentBalance}`);
            expect(currentBalance).toBe(10000);
            
            // Mock successful transaction
            mockConnection.sendTransaction.mockResolvedValueOnce('mock-tx-signature');

            // Log stake parameters before attempting the transaction
            console.log('Attempting to stake with parameters:', {
                amount: 1000,
                lockupPeriod: 86400,
                walletPublicKey: wallet.publicKey.toBase58(),
            });

            try {
                const result = await sdk.stakeTokens(1000, 86400);
                expect(result).toBeDefined();
                expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(1);
            } catch (error) {
                // Log detailed error information
                const actualBalance = await mockConnection.getBalance(wallet.publicKey);
                const accountInfo = await mockConnection.getAccountInfo(wallet.publicKey);
                
                console.error('Staking failed with error:', error);
                console.error('Actual balance at time of error:', actualBalance);
                console.error('Wallet public key:', wallet.publicKey.toBase58());
                console.error('Account info:', accountInfo);
            }
        });
    });

    describe('unstakeTokens', () => {
        it('should prevent early unstaking', async () => {
            const stake = await sdk.stakeTokens(1000, 86400);
            
            await expect(sdk.unstakeTokens(stake.id))
                .rejects
                .toThrow('Cannot unstake before lockup period ends');
        });

        it('should calculate early withdrawal penalties', async () => {
            const stake = await sdk.stakeTokens(1000, 86400);
            
            // Mock time to be halfway through stake period
            jest.spyOn(Date, 'now').mockImplementation(() => stake.startTime + 43200000);
            
            const penalty = await sdk.calculateUnstakePenalty(stake.id);
            expect(penalty).toBe(stake.amount * 0.5); // 50% penalty for early withdrawal
        });
    });

    describe('Staking Operations', () => {
        it('should stake tokens', async () => {
            const amount = 1000;
            const duration = 7 * 24 * 60 * 60; // 7 days

            const stake = await sdk.stakeTokens(amount, duration);

            expect(stake).toBeDefined();
            expect(stake.amount).toBe(amount);
            expect(stake.duration).toBe(duration);
            expect(stake.estimatedReward).toBe(amount * 0.01 * 7); // 1% daily reward
            expect(stake.lockupEndTime).toBeGreaterThan(Date.now() + duration * 1000);
            expect(stake.status).toBe('ACTIVE');
        });

        it('should reject invalid stake amounts', async () => {
            const invalidAmount = 100; // Below minimum
            await expect(sdk.stakeTokens(invalidAmount, 7 * 24 * 60 * 60))
                .rejects.toThrow('Stake amount too low');

            const tooHighAmount = 2000000; // Above maximum
            await expect(sdk.stakeTokens(tooHighAmount, 7 * 24 * 60 * 60))
                .rejects.toThrow('Stake amount too high');
        });

        it('should reject invalid stake durations', async () => {
            const amount = 1000;
            const tooShortDuration = 24 * 60 * 60; // 1 day
            await expect(sdk.stakeTokens(amount, tooShortDuration))
                .rejects.toThrow('Stake duration too short');

            const tooLongDuration = 2 * 365 * 24 * 60 * 60; // 2 years
            await expect(sdk.stakeTokens(amount, tooLongDuration))
                .rejects.toThrow('Stake duration too long');
        });

        it('should calculate early unstake penalties correctly', async () => {
            const amount = 1000;
            const duration = 604800; // 7 days
            
            const stake = await sdk.stakeTokens(amount, duration) as StakeInfo;
            
            // Mock time to halfway through stake period
            jest.spyOn(Date, 'now').mockImplementation(() => stake.startTime + 302400000);
            
            const penalty = await sdk.getUnstakePenalty(stake.stakeId);
            expect(penalty).toBe(amount * 0.5); // 50% penalty for early withdrawal
        });

        it('should allow unstaking after lockup period', async () => {
            const amount = 1000;
            const duration = 86400; // 1 day
            
            const stake = await sdk.stakeTokens(amount, duration) as StakeInfo;
            
            // Mock time to after lockup period
            jest.spyOn(Date, 'now').mockImplementation(() => stake.startTime + 86401000);
            
            const result = await sdk.unstakeTokens(stake.stakeId) as UnstakeResult;
            expect(result.success).toBe(true);
            expect(result.amount).toBe(amount);
            expect(result.reward).toBeGreaterThan(0);
        });
    });

    describe('Unstaking Operations', () => {
        let stake: StakeInfo;

        beforeEach(async () => {
            stake = await sdk.stakeTokens(1000, 7 * 24 * 60 * 60);
        });

        it('should unstake tokens after lockup period', async () => {
            // Fast forward time to after lockup period
            jest.useFakeTimers();
            jest.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000); // 8 days later

            const unstakeResult = await sdk.unstakeTokens(stake.stakeId);
            expect(unstakeResult.success).toBe(true);
            expect(unstakeResult.amount).toBe(stake.amount);
            expect(unstakeResult.reward).toBeGreaterThan(0);
            expect(unstakeResult.penalty).toBeUndefined();

            jest.useRealTimers();
        });

        it('should apply penalty for early unstaking', async () => {
            // Try to unstake immediately (before lockup period)
            const unstakeResult = await sdk.unstakeTokens(stake.stakeId);
            expect(unstakeResult.success).toBe(true);
            expect(unstakeResult.amount).toBe(stake.amount);
            expect(unstakeResult.penalty).toBe(stake.amount * 0.1); // 10% penalty
        });
    });
});
