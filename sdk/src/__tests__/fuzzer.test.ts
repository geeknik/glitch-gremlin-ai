import { Fuzzer, FuzzInput, FuzzConfig } from '../ai/fuzzer.js';
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
    let mockMetricsCollector: jest.Mocked<MetricsCollector>;

    beforeEach(async () => {
        // Set up metrics collector mock
        mockMetricsCollector = new MetricsCollector() as jest.Mocked<MetricsCollector>;
        mockMetricsCollector.recordMetric = jest.fn();

        const config: FuzzConfig = {
            targetProgram: new PublicKey('11111111111111111111111111111111'),
            maxIterations: 100,
            timeoutMs: 5000,
            mutationRate: 0.1,
            crossoverRate: 0.7,
            populationSize: 10,
            selectionPressure: 0.8,
            targetVulnerabilities: [
                VulnerabilityType.ARITHMETIC_OVERFLOW,
                VulnerabilityType.ACCESS_CONTROL
            ],
            maxAccounts: 5,
            maxDataSize: 1024,
            maxSeeds: 16
        };

        fuzzer = new Fuzzer(config);
    });

    afterEach(async () => {
        jest.clearAllMocks();
    });

    describe('fuzz', () => {
        const baseInput: FuzzInput = {
            programId: new PublicKey('11111111111111111111111111111111'),
            accounts: [
                new PublicKey('22222222222222222222222222222222'),
                new PublicKey('33333333333333333333333333333333')
            ],
            data: Buffer.from([0, 1, 2, 3]),
            seeds: [Buffer.from('test')]
        };

        it('should perform fuzzing and detect vulnerabilities', async () => {
            const result = await fuzzer.fuzz(baseInput);
            expect(result).toBeDefined();
            expect(result.input).toBeDefined();
            expect(result.vulnerabilities).toBeInstanceOf(Array);
            expect(result.metrics).toBeDefined();
            expect(result.transactions).toBeInstanceOf(Array);

            // Verify metrics collection
            expect(mockMetricsCollector.recordMetric)
                .toHaveBeenCalledWith('fuzzer.iteration', expect.any(Number));
        });

        it('should detect arithmetic overflow', async () => {
            const result = await fuzzer.fuzz({
                ...baseInput,
                data: Buffer.from([255, 255, 255, 255])
            });

            expect(result.vulnerabilities.some(v => v.type === VulnerabilityType.ARITHMETIC_OVERFLOW)).toBe(true);
            expect(mockMetricsCollector.recordMetric)
                .toHaveBeenCalledWith('fuzzer.vulnerability_detected', expect.any(Object));
        });

        it('should detect access control issues', async () => {
            const result = await fuzzer.fuzz({
                ...baseInput,
                accounts: [new PublicKey('44444444444444444444444444444444')]
            });

            expect(result.vulnerabilities.some(v => v.type === VulnerabilityType.ACCESS_CONTROL)).toBe(true);
            expect(mockMetricsCollector.recordMetric)
                .toHaveBeenCalledWith('fuzzer.vulnerability_detected', expect.any(Object));
        });
    });
});
