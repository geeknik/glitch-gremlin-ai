import { SecurityScoring } from '../src/solana/security-scoring-model';
import { Connection, PublicKey } from '@solana/web3.js';
import { SecurityPattern, AnalysisResult } from '../src/solana/types';
import { jest } from '@jest/globals';

describe('SecurityScoringModel', () => {
    let securityScoring: SecurityScoring;
    let connection: Partial<Connection>;

    beforeEach(() => {
        connection = {
            getAccountInfo: jest.fn().mockImplementation(() => Promise.resolve({
                lamports: 0n,
                owner: new PublicKey('11111111111111111111111111111111'),
                executable: false,
                data: Buffer.from([]),
                rentEpoch: 0
            })),
            getProgramAccounts: jest.fn().mockResolvedValue([{
                pubkey: new PublicKey('11111111111111111111111111111111'),
                account: {
                    lamports: 0n,
                    owner: new PublicKey('11111111111111111111111111111111'),
                    executable: false,
                    data: Buffer.from([]),
                    rentEpoch: 0
                }
            }]),
        } as Partial<Connection>;

        securityScoring = new SecurityScoring({}, connection as Connection);
    });

    describe('basic functionality', () => {
        it('should initialize correctly', () => {
            expect(securityScoring).toBeDefined();
        });

        it('should analyze program security', async () => {
            // Arrange
            const program = new PublicKey('11111111111111111111111111111111');
            
            // Act
            const result = await securityScoring.analyzeProgram(program);
            
            // Assert
            expect(result).toBeDefined();
            expect(result.score.score).toBeGreaterThanOrEqual(0);
            expect(result.score.score).toBeLessThanOrEqual(1);
            expect(result.score.risk).toBeDefined();
            expect(result.timestamp).toBeInstanceOf(Date);
            expect(result.programId).toBeDefined();
            expect(result.patterns).toBeInstanceOf(Array);
        });

        it('should identify vulnerabilities', async () => {
            const program = new PublicKey('11111111111111111111111111111111');
            const analysis = await securityScoring['identifyVulnerabilities'](program);
            
            expect(analysis).toBeDefined();
            expect(analysis.patterns).toBeDefined();
            expect(Array.isArray(analysis.patterns)).toBe(true);
            expect(analysis.timestamp).toBeInstanceOf(Date);
            analysis.patterns.forEach(pattern => {
                expect(pattern.risk).toBeDefined();
                expect(pattern.details).toBeDefined();
            });
        });
    });
});
