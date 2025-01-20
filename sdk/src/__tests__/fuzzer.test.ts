import { Fuzzer } from '../ai/fuzzer';
import { VulnerabilityType } from '../types';
import { PublicKey } from '@solana/web3.js';
import { IoRedisMock } from '../__mocks__/ioredis';
import { MetricsCollector } from '../metrics/collector';
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

        fuzzer = new Fuzzer(100, redisMock, mockMetricsCollector);
    });

    afterEach(async () => {
        await redisMock.flushall();
        jest.clearAllMocks();
    });

    describe('generateFuzzInputs', () => {
        it('should generate the specified number of inputs', async () => {
            redisMock.lrange.mockResolvedValueOnce(['instruction1', 'instruction2']);
            const testProgramId = new PublicKey('11111111111111111111111111111111');
            const inputs = await fuzzer.generateFuzzInputs(testProgramId);
            expect(inputs).toHaveLength(1000);
            expect(mockMetricsCollector.recordMetric).toHaveBeenCalled();
        });

        it('should generate inputs with valid structure', async () => {
            redisMock.lrange.mockResolvedValueOnce(['instruction1', 'instruction2']);
            const testProgramId = new PublicKey('11111111111111111111111111111111');
            const inputs = await fuzzer.generateFuzzInputs(testProgramId);

            expect(inputs[0]).toHaveProperty('instruction');
            expect(inputs[0]).toHaveProperty('data');
            expect(inputs[0]).toHaveProperty('probability');
            expect(inputs[0].probability).toBeGreaterThanOrEqual(0);
            expect(inputs[0].probability).toBeLessThanOrEqual(1);
        });

        it('should handle edge cases', async () => {
            // Test with invalid program ID
            await expect(fuzzer.generateFuzzInputs(null as any))
                .rejects.toThrow('Invalid program ID');

            // Test empty instruction set
            redisMock.lrange.mockResolvedValueOnce([]);
            const inputs = await fuzzer.generateFuzzInputs(new PublicKey('11111111111111111111111111111111'));
            expect(inputs).toHaveLength(0);
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
                    confidence: expect.any(Number)
                });
        });

        it('should detect access control issues', async () => {
            const result = { error: { message: 'unauthorized access attempt' }};
            const input = {
                instruction: 2,
                data: Buffer.from([1, 2, 3, 4])
            };

            const analysis = await fuzzer.analyzeFuzzResult(result, input);
            expect(analysis.type).toBe(VulnerabilityType.AccessControl);
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

            expect(analysis.type).toBeNull();
            expect(analysis.confidence).toBe(0);
        });
    });
});
