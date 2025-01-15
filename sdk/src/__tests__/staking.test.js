import { GlitchSDK } from '../sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { InsufficientFundsError } from '../errors';
import { IoRedisMock } from '../__mocks__/ioredis';

describe('Staking', () => {
    let sdk;
    let mockRedis;
    let mockConnection;
    let wallet;

    beforeAll(() => {
        mockRedis = new IoRedisMock();
        wallet = Keypair.generate();
        mockConnection = {
            getBalance: jest.fn(),
            getRecentBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-blockhash' }),
            sendTransaction: jest.fn()
        };
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet,
            governanceConfig: {
                minStakeAmount: 100,
                minStakeLockupPeriod: 86400,
                maxStakeLockupPeriod: 31536000
            }
        });
        
        // Inject mocks
        sdk['queueWorker'].redis = mockRedis;
        sdk['connection'] = mockConnection;
    });

    afterEach(async () => {
        // Clear Redis state
        await mockRedis.flushall();
        
        // Reset all mocks
        jest.clearAllMocks();
        
        if (jest.getTimerCount()) {
            jest.runOnlyPendingTimers();
            jest.useRealTimers();
        }
    });
    describe('stakeTokens', () => {
        it('should validate minimum stake amount', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            await expect(sdk.stakeTokens(50, 86400))
                .rejects.toThrow('Stake amount below minimum required');
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });
        it('should validate lockup period', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);

            await expect(sdk.stakeTokens(1000, 3600))
                .rejects.toThrow('Invalid lockup period');
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });
        it('should check token balance', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);

            // Mock low balance
            mockConnection.getBalance.mockResolvedValueOnce(50);

            await expect(sdk.stakeTokens(1000, 86400))
                .rejects.toThrow(InsufficientFundsError);
            
            expect(mockConnection.getBalance).toHaveBeenCalled();
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });
        it('should create stake successfully', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);

            // Mock sufficient balance
            mockConnection.getBalance.mockResolvedValueOnce(2000);
            mockConnection.sendTransaction.mockResolvedValueOnce('mock-tx-signature');

            const result = await sdk.stakeTokens(1000, 86400);
            
            expect(result).toBe('mock-tx-signature');
            expect(mockConnection.getBalance).toHaveBeenCalled();
            expect(mockConnection.sendTransaction).toHaveBeenCalled();
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });
    });
    describe('unstakeTokens', () => {
        it('should validate stake exists', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            // Mock getStakeInfo to return null for non-existent stake
            jest.spyOn(sdk, 'getStakeInfo').mockResolvedValueOnce(null);
            
            await expect(sdk.unstakeTokens('11111111111111111111111111111111'))
                .rejects.toThrow('Stake not found');
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });

        it('should check lockup period', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            // Mock stake info with future unlock time
            const now = Math.floor(Date.now() / 1000);
            jest.spyOn(sdk, 'getStakeInfo').mockResolvedValueOnce({
                amount: BigInt(1000),
                lockupPeriod: BigInt(86400),
                startTime: BigInt(now),
                owner: sdk['wallet'].publicKey
            });

            await expect(sdk.unstakeTokens('locked-stake'))
                .rejects.toThrow('Tokens are still locked');
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });

        it('should validate stake ownership', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            // Mock stake info with different owner
            const now = Math.floor(Date.now() / 1000) - 90000;
            jest.spyOn(sdk, 'getStakeInfo').mockResolvedValueOnce({
                amount: BigInt(1000),
                lockupPeriod: BigInt(86400),
                startTime: BigInt(now),
                owner: PublicKey.unique() // Different owner
            });

            await expect(sdk.unstakeTokens('other-owner-stake'))
                .rejects.toThrow('Not stake owner');
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });

        it('should handle zero amount stakes', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            // Mock stake info with zero amount
            const now = Math.floor(Date.now() / 1000) - 90000;
            jest.spyOn(sdk, 'getStakeInfo').mockResolvedValueOnce({
                amount: BigInt(0),
                lockupPeriod: BigInt(86400),
                startTime: BigInt(now),
                owner: sdk['wallet'].publicKey
            });

            await expect(sdk.unstakeTokens('zero-amount-stake'))
                .rejects.toThrow('Invalid stake amount');
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });

        it('should unstake successfully after lockup', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            // Mock stake info with passed unlock time
            const now = Math.floor(Date.now() / 1000);
            jest.spyOn(sdk, 'getStakeInfo').mockResolvedValueOnce({
                amount: BigInt(1000),
                lockupPeriod: BigInt(86400),
                startTime: BigInt(now - 90000),
                owner: sdk['wallet'].publicKey
            });

            // Mock transaction success
            mockConnection.getRecentBlockhash.mockResolvedValueOnce({ blockhash: 'mock-blockhash' });
            mockConnection.sendTransaction.mockResolvedValueOnce('mock-tx-signature');

            const result = await sdk.unstakeTokens('unlocked-stake');
            
            expect(result).toBe('mock-tx-signature');
            expect(mockConnection.sendTransaction).toHaveBeenCalled();
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });

        it('should handle transaction failures', async () => {
            // Mock rate limit check to pass
            mockRedis.incr.mockResolvedValue(1);
            mockRedis.expire.mockResolvedValue(1);
            
            // Mock stake info with passed unlock time
            const now = Math.floor(Date.now() / 1000);
            jest.spyOn(sdk, 'getStakeInfo').mockResolvedValueOnce({
                amount: BigInt(1000),
                lockupPeriod: BigInt(86400),
                startTime: BigInt(now - 90000),
                owner: sdk['wallet'].publicKey
            });

            // Mock transaction failure
            mockConnection.getRecentBlockhash.mockResolvedValueOnce({ blockhash: 'mock-blockhash' });
            mockConnection.sendTransaction.mockRejectedValueOnce(new Error('Transaction failed'));

            await expect(sdk.unstakeTokens('failed-unstake'))
                .rejects.toThrow('Transaction failed');
            
            expect(mockConnection.sendTransaction).toHaveBeenCalled();
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });
    });
});
