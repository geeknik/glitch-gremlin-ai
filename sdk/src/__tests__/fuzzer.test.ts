import { Fuzzer } from '../ai/fuzzer.js';
import { VulnerabilityType } from '../types.js';
import { PublicKey } from '@solana/web3.js';
import { IoRedisMock } from '../__mocks__/ioredis.js';
import { MetricsCollector } from '../metrics/collector.js';
import { jest } from '@jest/globals';

// Mock MetricsCollector
jest.mock('../metrics/collector', () => {
    return {
        MetricsCollector: jest.fn().mockImplementation(() => ({
            recordMetric: jest.fn()
        }))
    };
});

describe('Fuzzer', () => {
    let fuzzer: Fuzzer;
    let redisMock: IoRedisMock;
    let mockMetricsCollector: jest.Mocked<MetricsCollector>;

    beforeEach(async () => {
        // Set up Redis mock
        redisMock = new IoRedisMock({
            data: new Map(),
            keyPrefix: 'test:'
        });

        // Set up metrics collector mock
        mockMetricsCollector = new MetricsCollector() as jest.Mocked<MetricsCollector>;
        mockMetricsCollector.recordMetric = jest.fn();

        fuzzer = new Fuzzer(redisMock, mockMetricsCollector);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await redisMock.flushall();
        try {
            await redisMock.quit();
        } catch (error) {
            // Ignore Redis connection errors during cleanup
        }
    });

    describe('generateFuzzInput', () => {
        const baseInput = {
            instruction: 1,
            data: Buffer.from([0, 1, 2, 3]),
            probability: 0.5,
            metadata: {},
            created: Date.now()
        };

        it('should generate a mutated input', async () => {
            const input = await fuzzer.generateFuzzInput(baseInput);
            expect(input).toHaveProperty('instruction');
            expect(input).toHaveProperty('data');
            expect(input).toHaveProperty('probability');
            expect(input.probability).toBeGreaterThanOrEqual(0);
            expect(input.probability).toBeLessThanOrEqual(1);
        });

        it('should handle edge cases', async () => {
            // Test with invalid base input
            const nullInput = await fuzzer.generateFuzzInput(null as any);
            expect(nullInput.probability).toBeNaN();

            // Test with empty data
            const emptyInput = { ...baseInput, data: Buffer.from([]) };
            const input = await fuzzer.generateFuzzInput(emptyInput);
            expect(input.data).toBeInstanceOf(Buffer);
        });
    });

    describe('analyzeFuzzResult', () => {
        it('should detect arithmetic overflow', async () => {
            const result = { error: { message: 'arithmetic overflow detected' }};
            const input = {
                instruction: 1,
                data: Buffer.from([255, 255, 255, 255])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);
            expect(analysis.type).toBe(VulnerabilityType.ArithmeticOverflow);
            expect(analysis.confidence).toBeGreaterThan(0.7);

            // Verify metrics collection
            expect(mockMetricsCollector.recordMetric)
                .toHaveBeenCalledWith('vulnerability_detected', {
                    type: VulnerabilityType.ArithmeticOverflow,
                    confidence: expect.any(Number),
                    location: expect.any(String),
                    timestamp: expect.any(Number)
                });
        });

        it('should detect access control issues', async () => {
            const result = { error: { message: 'InvalidAccountOwner' }};
            const input = {
                instruction: 2,
                data: Buffer.from([1, 2, 3, 4])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);
            expect(analysis.type).toBe('access-control');
            expect(analysis.confidence).toBeGreaterThan(0.7);

            // Verify metrics collection
            expect(mockMetricsCollector.recordMetric)
                .toHaveBeenCalledWith('vulnerability_detected', {
                    type: VulnerabilityType.AccessControl,
                    confidence: expect.any(Number)
                });
        });

        it('should handle clean results', async () => {
            const result = { error: undefined };
            const input = {
                instruction: 3,
                data: Buffer.from([0, 0, 0, 0])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);

            expect(analysis.type).toBeUndefined();
            expect(analysis.confidence).toBeUndefined();
        });
    });
});
