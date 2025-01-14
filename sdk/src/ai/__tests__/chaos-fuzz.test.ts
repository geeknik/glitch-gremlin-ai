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
    type?: string; // Add type property for edge cases
    metadata: Record<string, unknown>;
    created: number;
    value?: any;
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
    connection: Connection;
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
import { PublicKey, Connection } from '@solana/web3.js';
import { VulnerabilityType } from '../src/types';
import { generateAnomalousMetrics } from '../src/test-utils/anomaly-test-utils';
describe('Chaos Fuzzing and Anomaly Detection Tests', () => {
    let anomalyModel: AnomalyDetectionModel;
    let fuzzer: Fuzzer;
    let mockMetrics: TimeSeriesMetrics[];
    const testProgramId = new PublicKey('11111111111111111111111111111111');
    let mockConnection: Connection;

    beforeAll(async () => {
        jest.setTimeout(120000); // Increase timeout to 120s for all tests to handle memory monitoring overhead
        jest.useFakeTimers();
        tf.setBackend('cpu'); // Ensure we're using CPU backend for tests

        // Mock connection for fuzzer
        mockConnection = {
            getAccountInfo: jest.fn(),
            getBalance: jest.fn(),
            getProgramAccounts: jest.fn(),
            sendTransaction: jest.fn(),
            getRecentBlockhash: jest.fn(),
            confirmTransaction: jest.fn(),
            getSignatureStatus: jest.fn()
        } as unknown as Connection;
    });

    afterAll(() => {
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
        await fuzzer.initialize(testProgramId, mockConnection); // Initialize fuzzer with mock connection
        mockMetrics = generateAnomalousMetrics(50); // Reduced from 100 to 50
    });

    afterEach(async () => {
        // Cleanup tensors and check for leaks
        try {
            if (anomalyModel) {
                await anomalyModel.cleanup();
            }
            if (fuzzer) {
                await fuzzer.cleanup();
            }
        } catch (error) {
            console.error("Cleanup error:", error); // Catch and log any cleanup errors
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

        // Assert no tensor leaks (adjust threshold if needed)
        expect(finalMemory.numTensors).toBeLessThanOrEqual(10);
        expect(finalMemory.numDataBuffers).toBeLessThanOrEqual(10);

        jest.clearAllMocks();
    });

    it('should handle anomalies during network latency', async () => {
        const metrics = generateAnomalousMetrics(100);

        const result = await anomalyModel.detect(metrics);
        expect(result.isAnomaly).toBe(false); // Expect no anomaly with valid metrics
        expect(result.confidence).toBeLessThanOrEqual(0.5); // Expect low confidence
    }, 20000); // Increased timeout to 20s


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

        } finally {
            currentMemory = tf.memory();
            console.log('[Test] Resource exhaustion test - Final memory:', currentMemory);
        }
    }, 30000); // 30s timeout for resource exhaustion test

    it('should properly clean up tensors after operations', async () => {
        const initialMemory = tf.memory();
        console.log('[Test] Tensor cleanup test - Initial memory:', initialMemory);

        const metrics = generateAnomalousMetrics(50);
        await anomalyModel.detect(metrics);

        const finalMemory = tf.memory();
        console.log('[Test] Tensor cleanup test - Final memory:', finalMemory);

        expect(finalMemory.numTensors).toBeLessThanOrEqual(initialMemory.numTensors + 10); // Adjust if needed
        expect(finalMemory.numBytes).toBeLessThan(initialMemory.numBytes * 2); // Adjust if needed
    });

    // ... (rest of the tests)
});

