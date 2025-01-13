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
            commitment: 'confirmed',
            rpcEndpoint: 'http://localhost:8899',
            getAccountInfo: jest.fn().mockResolvedValue({
                lamports: 0,
                owner: PublicKey.default,
                executable: false,
                data: Buffer.from([]),
                rentEpoch: 0
            }),
            getProgramAccounts: jest.fn().mockResolvedValue([{
                pubkey: PublicKey.default,
                account: {
                    lamports: 0,
                    owner: PublicKey.default,
                    executable: false,
                    data: Buffer.from([]),
                    rentEpoch: 0
                }
            }]),
            getRecentBlockhash: jest.fn().mockResolvedValue({
                blockhash: '1234567890',
                feeCalculator: { lamportsPerSignature: 5000 }
            }),
            getBalance: jest.fn().mockResolvedValue(0),
            getBalanceAndContext: jest.fn().mockResolvedValue({
                context: { slot: 0 },
                value: 0
            }),
            getMinimumBalanceForRentExemption: jest.fn().mockResolvedValue(0),
            getSlot: jest.fn().mockResolvedValue(0),
            getBlockTime: jest.fn().mockResolvedValue(0),
            getConfirmedSignaturesForAddress2: jest.fn().mockResolvedValue([]),
            getParsedConfirmedTransaction: jest.fn().mockResolvedValue(null),
            getConfirmedTransaction: jest.fn().mockResolvedValue(null),
        } as unknown as Connection;
        securityScoring = new SecurityScoring(connection);
    });

    describe('basic functionality', () => {
        it('should initialize correctly', () => {
            expect(securityScoring).toBeDefined();
        });

        it('should analyze program security', async () => {
            // Arrange
            const program = new PublicKey('11111111111111111111111111111111');
            
            // Define expected result type with required properties
            interface AnalysisResult {
                score: number;
                riskLevel: string;
                timestamp: Date;
                programId: PublicKey;
                patterns: SecurityPattern[];
            }
            
            // Act
            const result = (await securityScoring.analyzeSecurity(program)) as AnalysisResult;
            
            // Assert
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
