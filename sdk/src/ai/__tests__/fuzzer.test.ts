/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../../utils/logger.ts');

import { Fuzzer } from '../src/fuzzer.js';
import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType } from '../src/types';
import { Logger } from '../../utils/logger';

import { FuzzInput } from '../src/types';

interface TestFuzzInput extends Omit<FuzzInput, 'data'> {
    data: Buffer;
}

interface FuzzResult {
    type: VulnerabilityType | null;
    confidence: number;
    details?: string;
}
describe('Fuzzer', () => {
    let fuzzer: Fuzzer;
    let mockConnection: any;
    let mockLogger: jest.Mocked<Logger>;
    const mockMetricsCollector = {
        collect: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        reset: jest.fn().mockResolvedValue(undefined),
        getMetrics: jest.fn().mockResolvedValue({}),
        recordMetric: jest.fn()
    };
    const testProgramId = new PublicKey('11111111111111111111111111111111');

    beforeEach(async () => {
        // Set up logger mock
        mockLogger = {
            info: jest.fn().mockReturnThis(),
            debug: jest.fn().mockReturnThis(),
            warn: jest.fn().mockReturnThis(),
            error: jest.fn().mockReturnThis()
        } as any;
        (Logger as jest.MockedClass<typeof Logger>).mockImplementation(() => mockLogger);

        // Set up connection mock
        mockConnection = {
            sendAndConfirmTransaction: jest.fn().mockResolvedValue('tx-id'),
            getAccountInfo: jest.fn().mockResolvedValue(null),
            getProgramAccounts: jest.fn().mockResolvedValue([]),
            slot: 1,
            getSlot: jest.fn().mockResolvedValue(1)
        };
        fuzzer = new Fuzzer({
            mutationRate: 0.1,
            complexityLevel: 5,
            maxIterations: 10,
            metricsCollector: mockMetricsCollector
        });
        await fuzzer.initialize(testProgramId, mockConnection);
        jest.clearAllMocks();
    });

    describe('generateFuzzInputs', () => {
        it('should generate the specified number of inputs', async () => {
            const inputs = await fuzzer.generateFuzzInputs(testProgramId);
            expect(inputs).toHaveLength(1000);
            expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith('fuzz_inputs_generated', 1000);
        });

        it('should generate inputs with valid structure', async () => {
            const inputs = await fuzzer.generateFuzzInputs(testProgramId);
            inputs.forEach((input: FuzzInput) => {
                expect(input).toHaveProperty('instruction');
                expect(input).toHaveProperty('data');
                expect(input.data).toBeInstanceOf(Buffer);
            });
        });
    });

    describe('calculateProbability', () => {
        it('should return higher probability for edge case inputs', () => {
            const emptyBuffer = Buffer.alloc(0);
            const fullBuffer = Buffer.alloc(1024);
            
            const emptyProb = fuzzer['calculateProbability'](0, emptyBuffer);
            const fullProb = fuzzer['calculateProbability'](0, fullBuffer);
            const normalProb = fuzzer['calculateProbability'](0, Buffer.alloc(512));
            
            expect(emptyProb).toBeGreaterThan(0);
            expect(fullProb).toBeGreaterThan(0);
            expect(normalProb).toBeGreaterThanOrEqual(0);
        });

        it('should detect interesting values in data', () => {
            const buffer = Buffer.alloc(16);
            buffer.writeBigUInt64LE(0n, 0);
            buffer.writeBigUInt64LE(1n, 8);
            
            const prob = fuzzer['calculateProbability'](0, buffer);
            expect(prob).toBeGreaterThan(0);
        });
    });

    describe('analyzeFuzzResult', () => {
        it('should detect arithmetic overflow', async () => {
            const result: FuzzResult = await fuzzer.analyzeFuzzResult(
                new Error('arithmetic operation overflow'),
                { 
                    instruction: 0, 
                    data: Buffer.alloc(0),
                    probability: 0.5,
                    metadata: {},
                    created: Date.now()
                }
            );
            expect(result.type).toBe(VulnerabilityType.ArithmeticOverflow);
            expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        });

        it('should detect access control issues', async () => {
            const result: FuzzResult = await fuzzer.analyzeFuzzResult(
                new Error('unauthorized access attempt'),
                { 
                    instruction: 0, 
                    data: new Uint8Array(),
                    probability: 0.5,
                    metadata: {},
                    created: Date.now()
                }
            );
            expect(result.type).toBe(VulnerabilityType.AccessControl);
            expect(result.confidence).toBeGreaterThan(0.7);
        });

        it('should return null for no vulnerabilities', async () => {
            const result: FuzzResult = await fuzzer.analyzeFuzzResult(
                { error: 'generic error' },
                { 
                    instruction: 0, 
                    data: Buffer.alloc(0),
                    probability: 0.5,
                    metadata: {},
                    created: Date.now()
                }
            );
            expect(result.type).toBeNull();
            expect(result.confidence).toBe(0);
        });

        it('should detect PDA safety issues', async () => {
            const result: FuzzResult = await fuzzer.analyzeFuzzResult(
                new Error('invalid PDA derivation'),
                { 
                    instruction: 0, 
                    data: Buffer.alloc(0),
                    probability: 0.5,
                    metadata: {},
                    created: Date.now()
                }
            );
            expect(result.type).toBe(VulnerabilityType.PDASafety); 
            expect(result.confidence).toBeGreaterThan(0.7);
        });

        it('should detect reentrancy vulnerabilities', async () => {
            const result: FuzzResult = await fuzzer.analyzeFuzzResult(
                new Error('potential reentrancy detected'),
                { 
                    instruction: 0, 
                    data: Buffer.alloc(0),
                    probability: 1.0,
                    metadata: {},
                    created: Date.now()
                }
            );
            expect(result.type).toBe(VulnerabilityType.Reentrancy);
            expect(result.confidence).toBeGreaterThanOrEqual(0.8);
        });
    });

    describe('initialization', () => {
        it('should initialize with custom config', () => {
            const customConfig = {
                mutationRate: 0.2,
                complexityLevel: 8,
                maxIterations: 100
            };
            const customFuzzer = new Fuzzer(customConfig);
            expect(customFuzzer['config'].mutationRate).toBe(0.2);
            expect(customFuzzer['config'].complexityLevel).toBe(8);
            expect(customFuzzer['config'].maxIterations).toBe(100);
        });

        it('should handle invalid config values', () => {
            expect(() => new Fuzzer({ mutationRate: -1 })).toThrow();
            expect(() => new Fuzzer({ complexityLevel: 0 })).toThrow();
            expect(() => new Fuzzer({ maxIterations: -100 })).toThrow();
        });
    });

    describe('fuzzWithStrategy', () => {
        it('should execute bitflip strategy', async () => {
            const result = await fuzzer.fuzzWithStrategy('bitflip', testProgramId);
            expect(result.type).toBe('bitflip');
            expect(result.details).toBeDefined();
            expect(result.severity).toBeDefined();
        });

        it('should execute arithmetic strategy', async () => {
            const result = await fuzzer.fuzzWithStrategy('arithmetic', testProgramId);
            expect(result.type).toBe('arithmetic');
            expect(result.details).toBeDefined();
            expect(result.severity).toBeDefined();
        });

        it('should reject invalid strategy', async () => {
            await expect(fuzzer.fuzzWithStrategy('invalid', testProgramId))
                .rejects.toThrow('Unknown fuzzing strategy: invalid');
        });
    });
});
