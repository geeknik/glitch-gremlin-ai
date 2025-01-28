import { AnomalyDetector } from '../src/anomaly-detection.js';
import * as tf from '@tensorflow/tfjs';
import type { TimeSeriesMetric } from '../src/anomaly-detection.js';

// Set up TensorFlow.js for testing
beforeAll(async () => {
    await tf.setBackend('cpu');
    await tf.ready();
});

afterAll(() => {
    tf.disposeVariables();
});

/**
 * Generates mock metrics data for testing.
 * @param count Number of data samples to generate.
 * @param windowSize Number of time steps for each metric.
 */
function generateMetrics(count: number, windowSize: number = 1): TimeSeriesMetric[] {
    return Array(count).fill(null).map((_ , index) => ({
        instructionFrequency: Array(windowSize).fill(0).map(() => Math.random()),
        cpuUtilization: Array(windowSize).fill(0).map(() => Math.random()),
        pdaValidation: Array(windowSize).fill(0).map(() => Math.random()),
        accountDataMatching: Array(windowSize).fill(0).map(() => Math.random()),
        cpiSafety: Array(windowSize).fill(0).map(() => Math.random()),
        authorityChecks: Array(windowSize).fill(0).map(() => Math.random()),
        executionTime: Array(windowSize).fill(0).map(() => Math.random()),
        memoryUsage: Array(windowSize).fill(0).map(() => Math.random()),
        errorRate: Array(windowSize).fill(0).map(() => Math.random()),
        timestamp: Date.now() + index * 1000,
        metadata: {}
    }));
}

describe('AnomalyDetector', () => {
    let detector: AnomalyDetector;

    beforeEach(async () => {
        detector = await AnomalyDetector.create({
            windowSize: 1,
            zScoreThreshold: 2.0,
            minSampleSize: 10,
            anomalyThreshold: 0.8,
            timeSteps: 1,
            dropoutRate: 0.2,
            hiddenLayers: [64, 32, 64],
            epochs: 1,
            solanaWeights: {
                pdaValidation: 0.25,
                accountDataMatching: 0.25,
                cpiSafety: 0.25,
                authorityChecks: 0.25
            }
        });
    });

    afterEach(async () => {
        await detector.cleanup();
        tf.disposeVariables();
    });

    it('should initialize with Solana-specific weights', () => {
        expect(detector).toBeDefined();
        const config = detector.getConfig();
        expect(config.solanaWeights).toBeDefined();
        expect(config.solanaWeights.pdaValidation).toBe(0.25);
    });

    it('should train model with valid Solana metrics', async () => {
        const mockMetrics = generateMetrics(10);
        await expect(detector.train(mockMetrics)).resolves.not.toThrow();
    });

    it('should handle invalid input dimensions', async () => {
        const invalidData: TimeSeriesMetric[] = [];
        await expect(detector.train(invalidData))
            .rejects
            .toThrow('Training data cannot be empty');
    });

    it('should detect anomalies with valid input', async () => {
        const normalMetrics = generateMetrics(10);
        await detector.train(normalMetrics);

        const testMetric = generateMetrics(1)[0];
        const result = await detector.detect(testMetric);
        
        expect(result).toBeDefined();
        expect(typeof result.isAnomaly).toBe('boolean');
        expect(typeof result.anomalyScore).toBe('number');
        expect(result.metrics).toHaveLength(9);
        expect(result.zScores).toBeDefined();
    });
});
