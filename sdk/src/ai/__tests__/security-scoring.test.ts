import { SecurityScoring } from '../src/solana/security-scoring-model';
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { SecurityPattern } from '../src/solana/types';
import { jest } from '@jest/globals';
describe('SecurityScoring', () => {
    let securityScoring: SecurityScoring;
    let connection: Connection;

    beforeEach(() => {
        // Mock Connection
        // Mock Connection with proper types
        connection = {
        getAccountInfo: jest.fn().mockResolvedValue<AccountInfo<Buffer> | null>({
            lamports: 0,
            owner: PublicKey.default,
            executable: false,
            data: Buffer.from([]),
            rentEpoch: 0
        }),
        getProgramAccounts: jest.fn().mockResolvedValue<{
            pubkey: PublicKey;
            account: AccountInfo<Buffer>;
        }[]>([{
            pubkey: PublicKey.default,
            account: {
                lamports: 0,
                owner: PublicKey.default,
                executable: false,
                data: Buffer.from([]),
                rentEpoch: 0
            }
        }]),
        getRecentBlockhash: jest.fn().mockResolvedValue<{
            blockhash: string;
            feeCalculator: { lamportsPerSignature: number };
        }>({
            blockhash: '1234567890',
            feeCalculator: { lamportsPerSignature: 5000 }
        })
        } as jest.Mocked<Pick<Connection, 'getAccountInfo' | 'getProgramAccounts' | 'getRecentBlockhash'>>;
        securityScoring = new SecurityScoring(connection);
    });

    describe('basic functionality', () => {
        it('should initialize correctly', () => {
            expect(securityScoring).toBeDefined();
        });

        it('should analyze program security', async () => {
            const program = new PublicKey('11111111111111111111111111111111');
            const result = await securityScoring.analyzeSecurity(program);
            
            expect(result).toBeDefined();
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(result.riskLevel).toBeDefined();
            expect(result.timestamp).toBeInstanceOf(Date);
            expect(result.programId).toBeDefined();
        });

        it('should detect security patterns', async () => {
            const program = new PublicKey('11111111111111111111111111111111');
            const analysis = await securityScoring.detectPatterns(program);
            
            expect(analysis).toBeDefined();
            expect(analysis.patterns).toBeDefined();
            expect(Array.isArray(analysis.patterns)).toBe(true);
            expect(analysis.timestamp).toBeInstanceOf(Date);
        });
    });
});
