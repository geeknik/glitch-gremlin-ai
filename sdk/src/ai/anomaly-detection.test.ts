import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import { AnomalyDetectionModel, TimeSeriesMetrics } from './anomaly-detection';

const generateNormalMetrics = (count: number): TimeSeriesMetrics[] => {
    return Array.from({ length: count }, (_, i) => ({
        instructionFrequency: [Math.sin(i * 0.1) + 1],
        memoryAccess: [Math.cos(i * 0.1) + 1],
        accountAccess: [Math.sin(i * 0.05) + 1],
        stateChanges: [Math.cos(i * 0.05) + 1],
        pdaValidation: [Math.sin(i * 0.15) + 1],
        accountDataMatching: [Math.cos(i * 0.15) + 1],
        cpiSafety: [Math.sin(i * 0.08) + 1],
        authorityChecks: [Math.cos(i * 0.08) + 1],
        timestamp: Date.now() + i * 1000
    }));
};

const generateAnomalousMetrics = (count: number): TimeSeriesMetrics[] => {
    const metrics = generateNormalMetrics(count);
    // Inject anomaly in the middle
    const anomalyIndex = Math.floor(count / 2);
    metrics[anomalyIndex] = {
        instructionFrequency: [10], // Spike in instruction frequency
        memoryAccess: [8], // Unusual memory access
        accountAccess: [5], // Higher account access
        stateChanges: [7], // More state changes
        pdaValidation: [9], // PDA validation failure
        accountDataMatching: [8], // Account data mismatch
        cpiSafety: [7], // Unsafe CPI pattern
        authorityChecks: [6], // Authority validation issues
        timestamp: Date.now() + anomalyIndex * 1000
    };
    return metrics;
};

export { generateAnomalousMetrics };

describe('AnomalyDetectionModel', () => {
    let model: AnomalyDetectionModel;

    beforeEach(() => {
        model = new AnomalyDetectionModel();
    });

    afterEach(async () => {
        await model.cleanup();
    });


    describe('train', () => {
        it('should train successfully with sufficient data', async () => {
            const trainingData = generateNormalMetrics(200);
            await expect(model.train(trainingData)).resolves.not.toThrow();
        });

        it('should throw error with insufficient data', async () => {
            const trainingData = generateNormalMetrics(50);
            await expect(model.train(trainingData)).rejects.toThrow('Insufficient data points');
        });

        it('should emit epoch end events', async () => {
            const trainingData = generateNormalMetrics(200);
            const epochEndSpy = jest.fn();
            model.on('epochEnd', epochEndSpy);
            
            await model.train(trainingData);
            
            expect(epochEndSpy).toHaveBeenCalled();
            expect(epochEndSpy.mock.calls[0][0]).toHaveProperty('epoch');
            expect(epochEndSpy.mock.calls[0][0]).toHaveProperty('logs');
        });
    });

    describe('detect', () => {
        beforeEach(async () => {
            // Train model with normal data before each test
            const trainingData = generateNormalMetrics(200);
            await model.train(trainingData);
        });

        it('should detect normal behavior', async () => {
            const normalData = generateNormalMetrics(100);
            const result = await model.detect(normalData);
            
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.5);
            expect(result.details).toHaveLength(4);
        });

        it('should detect anomalous behavior', async () => {
            const anomalousData = generateAnomalousMetrics(100);
            const result = await model.detect(anomalousData);
            
            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.5);
            expect(result.details).toHaveLength(4);
        });

        it('should throw error if model is not trained', async () => {
            await model.cleanup(); // Reset model
            const testData = generateNormalMetrics(100);
            await expect(model.detect(testData)).rejects.toThrow('Model not trained');
        });

        it('should throw error with insufficient data points', async () => {
            const testData = generateNormalMetrics(50);
            await expect(model.detect(testData)).rejects.toThrow('Insufficient data points');
        });
    });

    describe('cleanup', () => {
        it('should clean up resources properly', async () => {
            const initialTensors = tf.memory().numTensors;
            await model.train(generateNormalMetrics(200));
            await model.cleanup();
            expect(tf.memory().numTensors).toBeLessThanOrEqual(initialTensors);
        });

        it('should handle multiple cleanup calls', async () => {
            await model.cleanup();
            await expect(model.cleanup()).resolves.not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should handle training with invalid data', async () => {
            const invalidData = [{ ...generateNormalMetrics(1)[0], instructionFrequency: [-1] }];
            await expect(model.train(invalidData)).rejects.toThrow('Invalid data format');
        });

        it('should handle null training data', async () => {
            await expect(model.train(null as any)).rejects.toThrow('Training data cannot be null');
        });

        it('should handle undefined training data', async () => {
            await expect(model.train(undefined as any)).rejects.toThrow('Training data cannot be undefined');
        });

        it('should handle invalid metric types', async () => {
            const invalidMetrics = [{
                instructionFrequency: [NaN],
                memoryAccess: [1],
                accountAccess: [1],
                stateChanges: [1],
                timestamp: Date.now()
            }];
            await expect(model.train(invalidMetrics)).rejects.toThrow('Invalid metric values');
        });

        it('should handle missing required fields', async () => {
            const incompleteMetrics = [{
                instructionFrequency: [1],
                // Missing other required fields
                timestamp: Date.now()
            }];
            await expect(model.train(incompleteMetrics as any)).rejects.toThrow('Missing required metrics fields');
        });
    });
    152|});

    153|    describe('Solana Vulnerability Detection', () => {
    154|        beforeEach(async () => {
    155|            // Train model with normal Solana transaction patterns
    156|            const trainingData = generateNormalMetrics(200);
    157|            await model.train(trainingData);
    158|        });
    159|
    160|        it('should detect PDA validation issues', async () => {
    161|            const testData = generateNormalMetrics(100);
    162|            testData[50].pdaValidation = [9.5]; // Inject PDA validation anomaly
    163|            const result = await model.detect(testData);
    164|            
    165|            expect(result.isAnomaly).toBe(true);
    166|            expect(result.details.find(d => d.type === 'pdaValidation')).toBeDefined();
    167|            expect(result.confidence).toBeGreaterThan(0.7);
    168|        });
    169|
    170|        it('should detect account data matching vulnerabilities', async () => {
    171|            const testData = generateNormalMetrics(100);
    172|            testData[50].accountDataMatching = [8.5]; // Inject account data mismatch
    173|            const result = await model.detect(testData);
    174|            
    175|            expect(result.isAnomaly).toBe(true);
    176|            expect(result.details.find(d => d.type === 'accountDataMatching')).toBeDefined();
    177|            expect(result.confidence).toBeGreaterThan(0.6);
    178|        });
    179|
    180|        it('should detect unsafe CPI patterns', async () => {
    181|            const testData = generateNormalMetrics(100);
    182|            testData[50].cpiSafety = [7.5]; // Inject unsafe CPI pattern
    183|            const result = await model.detect(testData);
    184|            
    185|            expect(result.isAnomaly).toBe(true);
    186|            expect(result.details.find(d => d.type === 'cpiSafety')).toBeDefined();
    187|            expect(result.confidence).toBeGreaterThan(0.65);
    188|        });
    189|
    190|        it('should detect authority validation issues', async () => {
    191|            const testData = generateNormalMetrics(100);
    192|            testData[50].authorityChecks = [6.5]; // Inject authority validation issue
    193|            const result = await model.detect(testData);
    194|            
    195|            expect(result.isAnomaly).toBe(true);
    196|            expect(result.details.find(d => d.type === 'authorityChecks')).toBeDefined();
    197|            expect(result.confidence).toBeGreaterThan(0.75);
    198|        });
    199|
    200|        it('should detect combined vulnerability patterns', async () => {
    201|            const testData = generateNormalMetrics(100);
    202|            // Inject multiple security issues
    203|            testData[50] = {
    204|                ...testData[50],
    205|                pdaValidation: [8.0],
    206|                accountDataMatching: [7.5],
    207|                cpiSafety: [6.5],
    208|                authorityChecks: [5.5]
    209|            };
    210|            const result = await model.detect(testData);
    211|            
    212|            expect(result.isAnomaly).toBe(true);
    213|            expect(result.confidence).toBeGreaterThan(0.85);
    214|            expect(result.details.filter(d => d.score > 0.6)).toHaveLength(4);
    215|        });
    216|
    217|        it('should perform correlation analysis between different vulnerabilities', async () => {
    218|            const testData = generateNormalMetrics(100);
    219|            // Create correlated vulnerability pattern
    220|            testData[50].pdaValidation = [8.5];
    221|            testData[51].accountDataMatching = [7.5];
    222|            testData[52].cpiSafety = [6.5];
    223|            
    224|            const result = await model.detect(testData);
    225|            expect(result.isAnomaly).toBe(true);
    226|            expect(result.details.some(d => d.correlatedPatterns?.length > 0)).toBe(true);
    227|        });
    228|    });
    229|
    230|    describe('save/load', () => {

        beforeEach(async () => {
            // Train model with some data before saving
            await model.train(generateNormalMetrics(200));
        });

        it('should save and load model successfully', async () => {
            await model.save(testModelPath);
            await model.cleanup(); // Reset model
            await expect(model.load(testModelPath)).resolves.not.toThrow();

            // Verify model works after loading
            const testData = generateNormalMetrics(100);
            const result = await model.detect(testData);
            expect(result).toBeDefined();
            expect(result.isAnomaly).toBeDefined();
            expect(result.confidence).toBeDefined();
        });

        it('should throw error when saving untrained model', async () => {
            await model.cleanup(); // Reset model
            await expect(model.save(testModelPath)).rejects.toThrow('Model not trained');
        });

        it('should throw error when loading from invalid path', async () => {
            await expect(model.load('./nonexistent-path')).rejects.toThrow('Model file not found');
        });

        it('should handle corrupted model files', async () => {
            // Save invalid model data
            await fs.promises.writeFile(`${testModelPath}/model.json`, 'invalid json');
            await expect(model.load(testModelPath)).rejects.toThrow('Invalid model format');
        });

        it('should maintain model performance after save/load', async () => {
            // Get predictions before save
            const testData = generateNormalMetrics(100);
            const beforeSave = await model.detect(testData);

            // Save and load model
            await model.save(testModelPath);
            await model.cleanup();
            await model.load(testModelPath);

            // Get predictions after load
            const afterLoad = await model.detect(testData);

            // Compare results
            expect(afterLoad.isAnomaly).toBe(beforeSave.isAnomaly);
            expect(afterLoad.confidence).toBeCloseTo(beforeSave.confidence, 2);
        });
    });
});
