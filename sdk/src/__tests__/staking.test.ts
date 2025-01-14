import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { GlitchSDK } from '../sdk.js';
import { Keypair } from '@solana/web3.js';
import { InsufficientFundsError } from '../errors.js';

describe('Staking', () => {
    let sdk: GlitchSDK;
    
    beforeEach(async () => {
        const wallet = Keypair.generate();
        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com',
            wallet,
            governanceConfig: {
                minStakeAmount: 100,
                minStakeLockupPeriod: 86400,
                maxStakeLockupPeriod: 31536000
            }
        });
    });

    describe('stakeTokens', () => {
        it('should handle transaction failures', async () => {
            // Mock sufficient balance to pass the initial check
            jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValueOnce(2000);
            
            // Mock the transaction failure
            jest.spyOn(sdk['connection'], 'sendTransaction')
                .mockRejectedValueOnce(new Error('Transaction failed'));

            await expect(sdk.stakeTokens(1000, 86400))
                .rejects.toThrow('Transaction failed');
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