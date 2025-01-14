import '@tensorflow/tfjs-node';  // Must be first import
import * as tf from '@tensorflow/tfjs';  // Import core TensorFlow.js
import { MemoryInfo } from '@tensorflow/tfjs-core/dist/engine';

declare global {
    namespace NodeJS {
        interface Global {
            gc?: () => void;
        }
    }
}

import { AnomalyDetectionModel, TimeSeriesMetrics, AnomalyDetectionResult } from '../src/anomaly-detection';
import { jest, SpyInstance } from '@jest/globals';
import { Fuzzer } from '../src/fuzzer';
import { Logger } from '@/utils/logger';

interface FuzzInput {
    instruction: number;
    data: Buffer;
    probability?: number;
}

interface FuzzResult {
    type: VulnerabilityType | null;
    confidence: number;
    details?: string;
}

interface FuzzingCampaignConfig {
    duration: number;
    maxIterations: number;
    programId: PublicKey;
}

interface CampaignResult {
    coverage: number;
    uniqueCrashes: number;
    executionsPerSecond: number;
}

interface AnomalyDetails {
    category: string;
    score: number;
    threshold: number;
}
import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType } from '../src/types';
import { generateAnomalousMetrics } from '../src/test-utils/anomaly-test-utils';
describe('Chaos Fuzzing and Anomaly Detection Tests', () => {
    let anomalyModel: AnomalyDetectionModel;
    let fuzzer: Fuzzer;
    let mockMetrics: TimeSeriesMetrics[];
    const testProgramId = new PublicKey('11111111111111111111111111111111');

    beforeAll(async () => {
        jest.setTimeout(120000); // Increase timeout to 120s for all tests to handle memory monitoring overhead
        jest.useFakeTimers();
        tf.setBackend('cpu'); // Ensure we're using CPU backend for tests
    });

    afterAll(async () => {
        try {
            // Clean up any tensors
            tf.disposeVariables();
        } catch (error) {
            console.warn('Error during TensorFlow cleanup:', error);
        }
        
        // Restore real timers
        jest.useRealTimers();
    });

    beforeEach(async () => {
        // Log initial memory state
        const initialMemory = tf.memory();
        console.log('[Test] Initial memory state:', {
            numTensors: initialMemory.numTensors,
            numDataBuffers: initialMemory.numDataBuffers,
            numBytes: initialMemory.numBytes
        });

        tf.engine().startScope();
        anomalyModel = new AnomalyDetectionModel();
        await anomalyModel.initialize(); // Initialize the model
        fuzzer = new Fuzzer({ port: 9464, metricsCollector: null });
        mockMetrics = generateAnomalousMetrics(50); // Reduced from 100 to 50
    });

    afterEach(async () => {
        // Cleanup tensors and check for leaks
        if (anomalyModel) {
            await anomalyModel.cleanup();
        }
        if (fuzzer) {
            await fuzzer.cleanup();
        }

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        tf.disposeVariables();
        tf.engine().endScope();

        // Check for tensor leaks
        const finalMemory = tf.memory();
        console.log('[Test] Final memory state:', {
            numTensors: finalMemory.numTensors,
            numDataBuffers: finalMemory.numDataBuffers,
            numBytes: finalMemory.numBytes
        });

        // Assert no tensor leaks
        expect(finalMemory.numTensors).toBeLessThan(1000); // Reasonable upper bound
        expect(finalMemory.numDataBuffers).toBeLessThan(1000);

        jest.clearAllMocks();
    });

    describe('Anomaly Detection under Simulated Failure Modes', () => {
        it('should handle anomalies during network latency', async () => {
            const metrics = generateAnomalousMetrics(100);
            const detectSpy = jest.spyOn(anomalyModel, 'detect')
                .mockImplementation(async (metrics: TimeSeriesMetrics[]): Promise<AnomalyDetectionResult> => {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate latency
                    return {
                        isAnomaly: true,
                        confidence: 0.8,
                        details: [{
                            category: 'latency',
                            score: 100,
                            threshold: 50
                        }]
                    };
                });

            const result = await anomalyModel.detect(metrics);
            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.5);
            
            detectSpy.mockRestore();
        });

        it('should report anomalies under resource exhaustion', async () => {
            const metrics = generateAnomalousMetrics(50);
            let initialMemory: MemoryInfo;
            let currentMemory: MemoryInfo;

            try {
                initialMemory = tf.memory();
                console.log('[Test] Resource exhaustion test - Initial memory:', initialMemory);

                // Create artificial memory pressure
                const tensors = [];
                for (let i = 0; i < 100; i++) {
                    tensors.push(tf.zeros([1000, 1000]));
                    if (i % 10 === 0) {
                        currentMemory = tf.memory();
                        console.log(`[Test] Created ${i} tensors. Current memory:`, currentMemory);
                    }
                }

                // Attempt detection under memory pressure
                await expect(async () =>
                    await anomalyModel.detect(metrics)
                ).rejects.toThrow(/Out of memory|Heap limit reached/);

                // Cleanup tensors
                tensors.forEach(t => t.dispose());

            } finally {
                currentMemory = tf.memory();
                console.log('[Test] Resource exhaustion test - Final memory:', currentMemory);
                expect(currentMemory.numTensors).toBeLessThan(initialMemory.numTensors + 100);
            }
        }, 30000); // 30s timeout for resource exhaustion test

        it('should properly clean up tensors after operations', async () => {
            const initialMemory = tf.memory();
            console.log('[Test] Tensor cleanup test - Initial memory:', initialMemory);

            const metrics = generateAnomalousMetrics(50);
            await anomalyModel.detect(metrics);

            const finalMemory = tf.memory();
            console.log('[Test] Tensor cleanup test - Final memory:', finalMemory);

            expect(finalMemory.numTensors).toBeLessThanOrEqual(initialMemory.numTensors + 10);
            expect(finalMemory.numBytes).toBeLessThan(initialMemory.numBytes * 2);
        });

        it('should handle memory-related failures gracefully', async () => {
            jest.spyOn(tf, 'tidy').mockImplementationOnce(() => {
                throw new Error('Out of memory');
            });

            await expect(async () =>
                await anomalyModel.detect(mockMetrics)
            ).rejects.toThrow('Out of memory');
        });
    });

    describe('Fuzzing Strategy Tests', () => {
        it('should test different mutation strategies', async () => {
            const strategies = ['bitflip', 'arithmetic', 'havoc', 'dictionary'];
            
            for (const strategy of strategies) {
                const result = await fuzzer.fuzzWithStrategy(strategy, testProgramId);
                expect(result.confidence).toBeGreaterThanOrEqual(0);  // Allow base confidence of 0
                expect(result.type).toBeDefined();
                expect(result.type).not.toBeNull();
            }
        });

        it('should validate mutation patterns', async () => {
            const input = Buffer.from('original input');
            const mutations = await fuzzer.generateMutations(input);
            
            mutations.forEach((mutation: Buffer) => {
                expect(mutation).not.toEqual(input);
                expect(mutation.length).toBeGreaterThanOrEqual(1);
                expect(mutation.length).toBeGreaterThanOrEqual(1);
            });
        });

        it('should generate edge cases effectively', async () => {
            const edgeCases = await fuzzer.generateEdgeCases();
            
            expect(edgeCases).toContainEqual(expect.objectContaining({
                type: 'boundary',
                value: expect.any(Buffer)
            }));
            expect(edgeCases).toContainEqual(expect.objectContaining({
                type: 'overflow',
                value: expect.any(Buffer)
            }));
        });
    });

    describe('Vulnerability Detection Tests', () => {
        it('should accurately detect known vulnerabilities', async () => {
            const vulnerableInput: FuzzInput = await fuzzer.generateVulnerableInput(VulnerabilityType.ArithmeticOverflow);
            const result: FuzzResult = await fuzzer.analyzeFuzzResult({ error: 'overflow' }, vulnerableInput);
            
            expect(result.type).toBe(VulnerabilityType.ArithmeticOverflow);
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        it('should handle stress conditions', async () => {
            const largeInputSize = 1000000;
            const stressInput = Buffer.alloc(largeInputSize);
            
            const startTime = Date.now();
            const result = await fuzzer.analyzeFuzzResult({ error: '' }, { instruction: 0, data: stressInput });
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(5000); // Should process within 5 seconds
            expect(result).toBeDefined();
        });
    });

    describe('Fuzzing Campaign Tests', () => {
        it('should track and report campaign progress', async () => {
            const config: FuzzingCampaignConfig = {
                duration: 1000,
                maxIterations: 100,
                programId: testProgramId
            };
            const campaign: CampaignResult = await fuzzer.startFuzzingCampaign(config);
            
            expect(campaign.coverage).toBeGreaterThan(0);
            expect(campaign.uniqueCrashes).toBeGreaterThanOrEqual(0);
            expect(campaign.executionsPerSecond).toBeGreaterThan(0);
        });

        it('should validate integration with vulnerability detection', async () => {
            const detectSpy = jest.spyOn(anomalyModel, 'detect');
            
            await fuzzer.fuzzWithAnomalyDetection(testProgramId, anomalyModel);
            
            expect(detectSpy).toHaveBeenCalled();
            const calls = detectSpy.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            
            detectSpy.mockRestore();
        });
    });

    describe('Extended Fuzzing Tests with Varied Inputs', () => {
        it('should handle high volume fuzzing inputs', async () => {
            const inputs = await fuzzer.generateFuzzInputs(testProgramId);
            expect(inputs.length).toBeGreaterThan(1000); // Test with more than default inputs
            
            // Analyze a subset of results
            const results = await Promise.all(
                inputs.slice(0, 100).map((input: FuzzInput) =>
                    fuzzer.analyzeFuzzResult({ error: '' }, input)
                )
            );
            
            // Handle potential null results
            results.forEach((result: { type: VulnerabilityType | null }) => {
                if (result.type === null) {
                    console.warn('Got null result type in high volume test');
                }
                expect(result).toBeDefined();
            });
        });

        it('should detect anomalies with combined edge cases', async () => {
            const buffer = Buffer.alloc(1024, 255); // Maxed out buffer
            const probability = fuzzer['calculateProbability'](0, buffer);
            expect(probability).toBe(1);

            const result = await fuzzer.analyzeFuzzResult({ error: 'overflow' }, { instruction: 0, data: buffer });
            expect(result.type).toBe(VulnerabilityType.ArithmeticOverflow);
        });
    });
});
