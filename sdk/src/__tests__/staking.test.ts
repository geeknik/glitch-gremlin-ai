import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis-mock';
import { GlitchSDK } from '../sdk.js';
import { Keypair, Connection } from '@solana/web3.js';
import { InsufficientFundsError } from '../errors.js';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('Staking', () => {
    let sdk: GlitchSDK;
    let mockConnection: jest.Mocked<Connection>;
    
    beforeEach(async () => {
        mockConnection = {
            getBalance: jest.fn(),
            getRecentBlockhash: jest.fn(),
            sendTransaction: jest.fn(),
            getAccountInfo: jest.fn(),
            getProgramAccounts: jest.fn(),
            getConfirmedSignaturesForAddress2: jest.fn()
        } as unknown as jest.Mocked<Connection>;

        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com',
            wallet: Keypair.generate(),
            governanceConfig: {
                minStakeAmount: 100,
                minStakeLockupPeriod: 86400,
                maxStakeLockupPeriod: 31536000
            },
            connection: mockConnection
        });

        // Mock rate limit checks to pass by default
        jest.spyOn(mockRedis, 'get').mockResolvedValue(null);
        jest.spyOn(mockRedis, 'set').mockResolvedValue('OK');
        jest.spyOn(mockRedis, 'incr').mockResolvedValue(1);
    });

    afterEach(async () => {
        if (mockRedis) {
            await mockRedis.quit();
        }
        jest.clearAllMocks();
    });

    describe('stakeTokens', () => {
        beforeEach(() => {
            // Mock getBalance to return sufficient balance by default
            mockConnection.getBalance.mockResolvedValue(2000);
            mockConnection.getRecentBlockhash.mockResolvedValue({
                blockhash: 'mock-blockhash',
                lastValidBlockHeight: 1000
            });
        });

        it('should handle transaction failures', async () => {
            mockConnection.sendTransaction.mockRejectedValueOnce(
                new Error('Transaction failed')
            );

            await expect(sdk.stakeTokens(1000, 86400))
                .rejects.toThrow('Transaction failed');
        });
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
            // Mock low balance
            jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValueOnce(50);

            await expect(sdk.stakeTokens(1000, 86400))
                .rejects.toThrow(InsufficientFundsError);
        });

        it('should create stake successfully', async () => {
            // Mock sufficient balance
            jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValueOnce(2000);

            // Mock transaction
            jest.spyOn(sdk['connection'], 'sendTransaction')
                .mockResolvedValueOnce('mock-tx-signature');

            const result = await sdk.stakeTokens(1000, 86400);
            expect(