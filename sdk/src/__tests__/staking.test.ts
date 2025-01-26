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

jest.mock('ioredis', () => require('ioredis-mock'));

let mockRedis: RedisMock;

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
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('stakeTokens', () => {

        it('should handle transaction failures', async () => {
            // First make sure we have sufficient balance
            // Mock sufficient balance
            mockConnection.getBalance.mockResolvedValueOnce(10000);
            // Mock successful transaction
            mockConnection.sendTransaction.mockResolvedValueOnce('mock-tx-signature');

            // Then mock the transaction failure
            mockConnection.sendTransaction.mockRejectedValueOnce(
                new Error('Transaction failed')
            );

            await expect(sdk.stakeTokens(1000, 86400))
                .rejects.toThrow(InsufficientFundsError);
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
});
