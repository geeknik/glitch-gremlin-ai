import { ChaosGenerator } from '../chaosGenerator.js';
import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType, VulnerabilityAnalysis } from '../../types.js';

describe('ChaosGenerator', () => {
    let generator: ChaosGenerator;
    const testProgramId = new PublicKey('11111111111111111111111111111111');

    beforeEach(() => {
        generator = new ChaosGenerator({
            targetProgram: testProgramId,
            maxAccounts: 5,
            maxDataSize: 1024,
            maxSeeds: 16,
            vulnerabilityTypes: [
                VulnerabilityType.ARITHMETIC_OVERFLOW,
                VulnerabilityType.ACCESS_CONTROL
            ]
        });
    });

    describe('generateChaos', () => {
        it('should generate valid chaos input', async () => {
            const params = {
                programId: testProgramId,
                accounts: [
                    new PublicKey('22222222222222222222222222222222'),
                    new PublicKey('33333333333333333333333333333333')
                ],
                data: Buffer.from([1, 2, 3, 4]),
                seeds: [Buffer.from('test')]
            };
            const result = await generator.generateChaos(params);
            expect(result.success).toBe(true);
            expect(result.coverage).toBeGreaterThan(0);
            expect(result.vulnerabilities).toBeInstanceOf(Array);
            expect(result.transactions).toBeInstanceOf(Array);
        });

        it('should detect arithmetic overflow vulnerabilities', async () => {
            const params = {
                programId: testProgramId,
                accounts: [
                    new PublicKey('22222222222222222222222222222222')
                ],
                data: Buffer.from([255, 255, 255, 255]),
                seeds: [Buffer.from('overflow')]
            };
            const result = await generator.generateChaos(params);
            expect(result.vulnerabilities.some((v: VulnerabilityAnalysis) => v.type === VulnerabilityType.ARITHMETIC_OVERFLOW)).toBe(true);
        });

        it('should detect access control vulnerabilities', async () => {
            const params = {
                programId: testProgramId,
                accounts: [
                    new PublicKey('44444444444444444444444444444444')
                ],
                data: Buffer.from([1, 2, 3, 4]),
                seeds: [Buffer.from('access')]
            };
            const result = await generator.generateChaos(params);
            expect(result.vulnerabilities.some((v: VulnerabilityAnalysis) => v.type === VulnerabilityType.ACCESS_CONTROL)).toBe(true);
        });
    });
});
