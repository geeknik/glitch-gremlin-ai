import { jest } from '@jest/globals';
import { Fuzzer } from '../ai/fuzzer.js';
import { VulnerabilityType } from '../ai/types.js';
import { PublicKey } from '@solana/web3.js';

describe('Fuzzer', () => {
    let fuzzer;

    beforeEach(() => {
        fuzzer = new Fuzzer({
            programId: new PublicKey('11111111111111111111111111111111'),
            mlModelPath: './test-models/fuzzer-model',
            maxIterations: 1000,
            confidenceThreshold: 0.8
        });
    });

    describe('vulnerability detection', () => {
        it('should detect arithmetic overflow vulnerabilities', async () => {
            const result = await fuzzer.analyze({
                instructionData: Buffer.from([255, 255, 255, 255]),
                accounts: [
                    { pubkey: new PublicKey('22222222222222222222222222222222'), isSigner: false, isWritable: true }
                ],
                recentInstructions: ['Transfer', 'MintTo', 'Transfer'],
                programId: new PublicKey('11111111111111111111111111111111')
            });

            expect(result.vulnerabilities).toContainEqual(expect.objectContaining({
                type: VulnerabilityType.ARITHMETIC_OVERFLOW,
                confidence: expect.any(Number),
                location: expect.any(String),
                severity: expect.any(String)
            }));
            expect(result.logs).toContain('Detected potential arithmetic overflow');
        });

        it('should detect access control vulnerabilities', async () => {
            const result = await fuzzer.analyze({
                instructionData: Buffer.from([0, 0, 0, 0]),
                accounts: [
                    { pubkey: new PublicKey('22222222222222222222222222222222'), isSigner: false, isWritable: true },
                    { pubkey: new PublicKey('33333333333333333333333333333333'), isSigner: false, isWritable: true }
                ],
                recentInstructions: ['InitializeMint', 'MintTo', 'Transfer'],
                programId: new PublicKey('11111111111111111111111111111111')
            });

            expect(result.vulnerabilities).toContainEqual(expect.objectContaining({
                type: VulnerabilityType.ACCESS_CONTROL,
                confidence: expect.any(Number),
                location: expect.any(String),
                severity: expect.any(String)
            }));
            expect(result.logs).toContain('Detected potential access control vulnerability');
        });

        it('should detect reentrancy vulnerabilities', async () => {
            const result = await fuzzer.analyze({
                instructionData: Buffer.from([1, 1, 1, 1]),
                accounts: [
                    { pubkey: new PublicKey('22222222222222222222222222222222'), isSigner: true, isWritable: true },
                    { pubkey: new PublicKey('33333333333333333333333333333333'), isSigner: false, isWritable: true },
                    { pubkey: new PublicKey('44444444444444444444444444444444'), isSigner: false, isWritable: true }
                ],
                recentInstructions: ['Transfer', 'Transfer', 'Transfer'],
                programId: new PublicKey('11111111111111111111111111111111')
            });

            expect(result.vulnerabilities).toContainEqual(expect.objectContaining({
                type: VulnerabilityType.REENTRANCY,
                confidence: expect.any(Number),
                location: expect.any(String),
                severity: expect.any(String)
            }));
            expect(result.logs).toContain('Detected potential reentrancy vulnerability');
        });
    });

    describe('fuzzing strategies', () => {
        it('should apply mutation-based fuzzing', async () => {
            const baseInstruction = {
                instructionData: Buffer.from([0, 0, 0, 0]),
                accounts: [
                    { pubkey: new PublicKey('22222222222222222222222222222222'), isSigner: false, isWritable: true }
                ],
                recentInstructions: ['Transfer'],
                programId: new PublicKey('11111111111111111111111111111111')
            };

            const results = await fuzzer.fuzz(baseInstruction, { strategy: 'mutation', iterations: 10 });
            expect(results.length).toBe(10);
            expect(results.some(r => r.vulnerabilities.length > 0)).toBe(true);
        });

        it('should apply genetic algorithm-based fuzzing', async () => {
            const baseInstruction = {
                instructionData: Buffer.from([0, 0, 0, 0]),
                accounts: [
                    { pubkey: new PublicKey('22222222222222222222222222222222'), isSigner: false, isWritable: true }
                ],
                recentInstructions: ['Transfer'],
                programId: new PublicKey('11111111111111111111111111111111')
            };

            const results = await fuzzer.fuzz(baseInstruction, { 
                strategy: 'genetic',
                iterations: 10,
                populationSize: 5,
                mutationRate: 0.1
            });
            
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('fitness');
            expect(results[0]).toHaveProperty('generation');
        });
    });

    describe('rate limiting', () => {
        it('should respect rate limits during fuzzing', async () => {
            const instruction = {
                instructionData: Buffer.from([0, 0, 0, 0]),
                accounts: [
                    { pubkey: new PublicKey('22222222222222222222222222222222'), isSigner: false, isWritable: true }
                ],
                recentInstructions: ['Transfer'],
                programId: new PublicKey('11111111111111111111111111111111')
            };

            const startTime = Date.now();
            await fuzzer.fuzz(instruction, { strategy: 'mutation', iterations: 5 });
            const duration = Date.now() - startTime;

            expect(duration).toBeGreaterThanOrEqual(500); // Assuming 100ms minimum delay between requests
        });
    });

    describe('error handling', () => {
        it('should handle invalid instruction data', async () => {
            await expect(fuzzer.analyze({
                instructionData: null,
                accounts: [],
                recentInstructions: [],
                programId: new PublicKey('11111111111111111111111111111111')
            })).rejects.toThrow('Invalid instruction data');
        });

        it('should handle invalid account data', async () => {
            await expect(fuzzer.analyze({
                instructionData: Buffer.from([0]),
                accounts: null,
                recentInstructions: [],
                programId: new PublicKey('11111111111111111111111111111111')
            })).rejects.toThrow('Invalid account data');
        });
    });
});
