import { Fuzzer } from '../ai/fuzzer';
import { VulnerabilityType } from '../types';
import { PublicKey } from '@solana/web3.js';

describe('Fuzzer', () => {
    let fuzzer;

    beforeEach(async () => {
        fuzzer = new Fuzzer({ port: 9464, metricsCollector: null }); // Use smaller iteration count for tests
    });

    describe('generateFuzzInputs', () => {
        it('should generate valid fuzz inputs', async () => {
            const programId = new PublicKey('11111111111111111111111111111111');
            const inputs = await fuzzer.generateFuzzInputs(programId);

            expect(inputs.length).toBe(1000);
            expect(inputs[0]).toHaveProperty('instruction');
            expect(inputs[0]).toHaveProperty('data');
            expect(inputs[0]).toHaveProperty('probability');

            // Verify inputs are sorted by probability
            expect(inputs[0].probability).toBeGreaterThanOrEqual(inputs[1].probability);
        });
    });

    describe('analyzeFuzzResult', () => {
        it('should detect arithmetic overflow', async () => {
            const result = { error: 'arithmetic overflow detected' };
            const input = {
                instruction: 1,
                data: Buffer.from([255, 255, 255, 255])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);

            expect(analysis.type).toBe(VulnerabilityType.ArithmeticOverflow);
            expect(analysis.confidence).toBeGreaterThan(0.7);
        });

        it('should detect access control issues', async () => {
            const result = { error: 'unauthorized access attempt' };
            const input = {
                instruction: 2,
                data: Buffer.from([1, 2, 3, 4])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);

            expect(analysis.type).toBe(VulnerabilityType.AccessControl);
            expect(analysis.confidence).toBeGreaterThan(0.6);
        });

        it('should handle clean results', async () => {
            const result = { error: undefined };
            const input = {
                instruction: 3,
                data: Buffer.from([0, 0, 0, 0])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);

            expect(analysis.type).toBeNull();
            expect(analysis.confidence).toBe(0);
        });
    });
});
