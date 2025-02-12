/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../../utils/logger.ts');
jest.mock('@solana/web3.js');

import { VulnerabilityType } from '../src/types.js';
import { Logger } from '../../utils/logger.js';
import { FuzzInput, FuzzingResult } from '../src/types.js';
import { Fuzzer } from '../src/fuzzer.js';
import { PublicKey } from '@solana/web3.js';
import mockConnection from '../src/__mocks__/@solana/web3.js';

describe('Fuzzer', () => {
    let fuzzer: Fuzzer;
    let mockLogger: Logger;
    const testProgramId = new PublicKey('11111111111111111111111111111111');

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            addListener: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            removeListener: jest.fn(),
            off: jest.fn(),
            removeAllListeners: jest.fn(),
            setMaxListeners: jest.fn(),
            getMaxListeners: jest.fn(),
            listeners: jest.fn(),
            rawListeners: jest.fn(),
            emit: jest.fn(),
            listenerCount: jest.fn(),
            prependListener: jest.fn(),
            prependOnceListener: jest.fn(),
            eventNames: jest.fn()
        } as unknown as Logger;
        (Logger as jest.MockedClass<typeof Logger>).mockImplementation(() => mockLogger);

        fuzzer = new Fuzzer({
            mutationRate: 0.1,
            maxIterations: 10,
            connection: mockConnection()
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with default config', () => {
            const defaultFuzzer = new Fuzzer();
            expect(defaultFuzzer).toBeDefined();
            expect(defaultFuzzer['config']).toBeDefined();
            expect(defaultFuzzer['config'].maxIterations).toBe(1000);
            expect(defaultFuzzer['config'].mutationRate).toBe(0.1);
        });

        it('should initialize with custom config', () => {
            expect(fuzzer['config'].maxIterations).toBe(10);
            expect(fuzzer['config'].mutationRate).toBe(0.1);
        });

        it('should throw error for invalid config values', () => {
            expect(() => new Fuzzer({ maxIterations: -1 })).toThrow();
            expect(() => new Fuzzer({ mutationRate: -0.1 })).toThrow();
        });
    });

    describe('fuzz', () => {
        const testInput: FuzzInput = {
            data: Buffer.from([1, 2, 3, 4]),
            metadata: {
                type: 'test',
                mutationCount: 0,
                timestamp: Date.now()
            }
        };

        it('should generate and test program inputs', async () => {
            const result = await fuzzer.fuzz(testInput);
            expect(result).toBeDefined();
            expect(result.vulnerabilitiesFound).toBeDefined();
            expect(Array.isArray(result.vulnerabilitiesFound)).toBe(true);
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should detect arithmetic overflow vulnerabilities', async () => {
            const result = await fuzzer.fuzz(testInput);
            expect(result.vulnerabilitiesFound).toContainEqual(
                expect.objectContaining({
                    type: VulnerabilityType.ArithmeticOverflow
                })
            );
        });

        it('should detect access control vulnerabilities', async () => {
            const result = await fuzzer.fuzz(testInput);
            expect(result.vulnerabilitiesFound).toContainEqual(
                expect.objectContaining({
                    type: VulnerabilityType.AccessControl
                })
            );
        });

        it('should detect race condition vulnerabilities', async () => {
            const result = await fuzzer.fuzz(testInput);
            expect(result.vulnerabilitiesFound).toContainEqual(
                expect.objectContaining({
                    type: VulnerabilityType.RaceCondition
                })
            );
        });
    });

    describe('error handling', () => {
        it('should handle program not found error', async () => {
            const invalidInput: FuzzInput = {
                data: Buffer.from([]),
                metadata: {
                    type: 'test',
                    mutationCount: 0,
                    timestamp: Date.now()
                }
            };
            await expect(fuzzer.fuzz(invalidInput)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle timeout error', async () => {
            const timeoutFuzzer = new Fuzzer({ maxIterations: 1, timeoutMs: 1 });
            const testInput: FuzzInput = {
                data: Buffer.from([1, 2, 3, 4]),
                metadata: {
                    type: 'test',
                    mutationCount: 0,
                    timestamp: Date.now()
                }
            };
            await expect(timeoutFuzzer.fuzz(testInput)).rejects.toThrow('Timeout');
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });
});
