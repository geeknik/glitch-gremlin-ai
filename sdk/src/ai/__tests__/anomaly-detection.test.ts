import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import { AnomalyDetectionModel } from '../src/anomaly-detection';

interface TimeSeriesMetrics {
    instructionFrequency: number[];
    memoryAccess: number[];
    accountAccess: number[];
    stateChanges: number[];
    pdaValidation: number[];
    accountDataMatching: number[];
    cpiSafety: number[];
    authorityChecks: number[];
    timestamp: number;
}

interface AnomalyDetectionResult {
    isAnomaly: boolean;
    confidence: number;
    details: AnomalyDetail[];
}

interface AnomalyDetail {
    type: string;
    score: number;
    confidence?: number;
    correlatedPatterns?: string[];
}
describe('AnomalyDetectionModel', () => {
    let model: AnomalyDetectionModel;
    const testModelPath = './test-model';

    beforeEach(() => {
        model = new AnomalyDetectionModel();
    });

    afterEach(async () => {
        await model.cleanup();
    });

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
        const anomalyIndex = Math.floor(count / 2);
        metrics[anomalyIndex] = {
            instructionFrequency: [10],
            memoryAccess: [8],
            accountAccess: [5], 
            stateChanges: [7],
            pdaValidation: [9],
            accountDataMatching: [8],
            cpiSafety: [7],
            authorityChecks: [6],
            timestamp: Date.now() + anomalyIndex * 1000
        };
        return metrics;
    };

    describe('initialization', () => {
        it('should initialize properly', async () => {
            await expect(model.initialize()).resolves.not.toThrow();
        });
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
    });

    describe('detect', () => {
        beforeEach(async () => {
            await model.train(generateNormalMetrics(200));
        });

        it('should detect normal behavior', async () => {
            const normalData = generateNormalMetrics(100);
            const result = await model.detect(normalData);
            
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.5);
        });

        it('should detect anomalous behavior', async () => {
            const anomalousData = generateAnomalousMetrics(100);
            const result = await model.detect(anomalousData);
            
            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.5);
        });
    });

    describe('save/load', () => {
        beforeEach(async () => {
            await model.train(generateNormalMetrics(200));
        });

        it('should save and load model correctly', async () => {
            await model.save(testModelPath);
            await model.cleanup();
            await expect(model.load(testModelPath)).resolves.not.toThrow();
        });

        it('should handle invalid model paths', async () => {
            await expect(model.load('./nonexistent-path')).rejects.toThrow();
        });
    });

    describe('cleanup', () => {
        it('should cleanup resources properly', async () => {
            const numTensorsBefore = tf.memory().numTensors;
            await model.train(generateNormalMetrics(200));
            await model.cleanup();
            expect(tf.memory().numTensors).toBeLessThanOrEqual(numTensorsBefore);
        });
    });
});


describe('AnomalyDetectionModel', () => {
    const testModelPath = './test-model';
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
    });

    describe('Security Pattern Detection', () =>
    describe('Solana Vulnerability Detection', () => {
        beforeEach(async () => {
            // Train model with normal Solana transaction patterns
            const trainingData = generateNormalMetrics(200);
            await model.train(trainingData);
        });
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

    describe('Resource Management', () => {
        let modelInstances: AnomalyDetectionModel[] = [];

        afterEach(async () => {
            // Clean up all model instances
            await Promise.all(modelInstances.map(m => m.cleanup()));
            modelInstances = [];
        });

        it('should release memory after processing large batches', async () => {
            const model = new AnomalyDetectionModel();
            modelInstances.push(model);
            
            const initialMemory = tf.memory().numBytes;
            const largeData = generateNormalMetrics(5000);
            
            await model.train(largeData);
            await model.detect(generateNormalMetrics(1000));
            await model.cleanup();
            
            expect(tf.memory().numBytes).toBeLessThan(initialMemory * 1.1); // Allow 10% overhead
        });

        it('should handle concurrent model instances', async () => {
            const instances = Array(3).fill(null).map(() => {
                const m = new AnomalyDetectionModel();
                modelInstances.push(m);
                return m;
            });

            await Promise.all(instances.map(async (instance) => {
                await instance.train(generateNormalMetrics(200));
                const result = await instance.detect(generateNormalMetrics(100));
                expect(result).toBeDefined();
            }));
        });

        it('should cleanup all tensors after model disposal', async () => {
            const model = new AnomalyDetectionModel();
            modelInstances.push(model);
            
            const tensorsBeforeTraining = tf.memory().numTensors;
            await model.train(generateNormalMetrics(200));
            
            const intermediateTensors = tf.memory().numTensors;
            expect(intermediateTensors).toBeGreaterThan(tensorsBeforeTraining);
            
            await model.cleanup();
            expect(tf.memory().numTensors).toBeLessThanOrEqual(tensorsBeforeTraining);
        });
    });

    describe('Security Pattern Detection', () => {
        let model: AnomalyDetectionModel;

        beforeEach(async () => {
            model = new AnomalyDetectionModel();
            await model.train(generateNormalMetrics(500));
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should detect sudden instruction frequency spikes', async () => {
            const testData = generateNormalMetrics(100);
            // Simulate attack pattern with sudden spike
            testData[50].instructionFrequency = [15.0]; // Extreme spike
            testData[51].instructionFrequency = [12.0]; // Sustained high activity
            testData[52].instructionFrequency = [10.0]; // Gradual decrease

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'instructionFrequency')?.score).toBeGreaterThan(0.8);
        });

        it('should identify suspicious state change patterns', async () => {
            const testData = generateNormalMetrics(100);
            // Simulate suspicious state changes
            testData[45].stateChanges = [8.0];
            testData[46].accountAccess = [7.0];
            testData[47].memoryAccess = [6.0];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.some(d => d.correlatedPatterns?.length >= 2)).toBe(true);
        });

        it('should detect unusual account access sequences', async () => {
            const testData = generateNormalMetrics(100);
            // Simulate suspicious account access pattern
            for (let i = 40; i < 45; i++) {
                testData[i].accountAccess = [6.0];
                testData[i].authorityChecks = [5.0];
            }

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.7);
        });
    describe('Advanced Attack Pattern Detection', () => {
        beforeEach(async () => {
            model = new AnomalyDetectionModel();
            await model.train(generateNormalMetrics(500));
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should detect time-based attack patterns', async () => {
            const testData = generateNormalMetrics(200);
            // Simulate time-based attack pattern
            for (let i = 50; i < 60; i++) {
                testData[i].instructionFrequency = [5 + (i - 50) * 0.5];
                testData[i].memoryAccess = [4 + (i - 50) * 0.3];
                if (i % 2 === 0) {
                    testData[i].accountAccess = [6.0];
                }
            }

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'timeBasedPattern')?.confidence).toBeGreaterThan(0.75);
        });

        it('should identify sophisticated masking attempts', async () => {
            const testData = generateNormalMetrics(150);
            // Simulate masked attack pattern
            for (let i = 40; i < 60; i++) {
                if (i % 3 === 0) {
                    testData[i].instructionFrequency = [6.0];
                    testData[i].memoryAccess = [5.0];
                } else {
                    testData[i].instructionFrequency = [1.2];
                    testData[i].memoryAccess = [1.1];
                }
            }

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'maskedPattern')?.score).toBeGreaterThan(0.7);
        });

        it('should detect multiple correlated anomalies', async () => {
            const testData = generateNormalMetrics(200);
            // Create multiple correlated anomalies
            testData[80].instructionFrequency = [7.0];
            testData[80].accountAccess = [6.0];
            testData[81].memoryAccess = [5.5];
            testData[82].stateChanges = [6.5];
            testData[83].authorityChecks = [4.5];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.filter(d => d.score > 0.6).length).toBeGreaterThan(3);
            expect(result.confidence).toBeGreaterThan(0.8);
        });
    });

    describe('Blockchain-Specific Attack Patterns', () => {
        beforeEach(async () => {
            model = new AnomalyDetectionModel();
            await model.train(generateNormalMetrics(500));
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should detect flash loan attack patterns', async () => {
            const testData = generateNormalMetrics(150);
            // Simulate flash loan attack
            testData[50].instructionFrequency = [9.0];
            testData[50].memoryAccess = [8.5];
            testData[50].accountAccess = [7.5];
            testData[51].stateChanges = [8.0];
            testData[52].instructionFrequency = [8.5];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'flashLoanPattern')?.confidence).toBeGreaterThan(0.8);
        });

        it('should identify reentrancy attack patterns', async () => {
            const testData = generateNormalMetrics(150);
            // Simulate reentrancy pattern
            for (let i = 60; i < 65; i++) {
                testData[i].accountAccess = [6.0 + (i - 60) * 0.5];
                testData[i].instructionFrequency = [5.0 + (i - 60) * 0.4];
                testData[i].cpiSafety = [4.0 + (i - 60) * 0.6];
            }

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'reentrancyPattern')?.score).toBeGreaterThan(0.75);
        });

        it('should detect authority manipulation attempts', async () => {
            const testData = generateNormalMetrics(150);
            // Simulate authority manipulation
            testData[70].authorityChecks = [7.5];
            testData[71].pdaValidation = [6.5];
            testData[72].accountDataMatching = [6.0];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'authorityManipulation')?.confidence).toBeGreaterThan(0.8);
        });
    });

    describe('False Positive Analysis', () => {
        beforeEach(async () => {
            model = new AnomalyDetectionModel();
            await model.train(generateNormalMetrics(500));
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should handle normal program upgrades correctly', async () => {
            const testData = generateNormalMetrics(100);
            // Simulate program upgrade pattern
            testData[50].instructionFrequency = [4.0];
            testData[50].stateChanges = [3.5];
            
            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.4);
        });

        it('should not flag legitimate high-volume transactions', async () => {
            const testData = generateNormalMetrics(100);
            // Simulate high but legitimate transaction volume
            for (let i = 40; i < 45; i++) {
                testData[i].instructionFrequency = [3.5];
                testData[i].memoryAccess = [3.0];
                testData[i].accountAccess = [3.2];
            }

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.5);
        });

        it('should handle periodic maintenance operations', async () => {
            const testData = generateNormalMetrics(100);
            // Simulate maintenance operations
            testData[50].stateChanges = [4.0];
            testData[50].accountAccess = [3.8];
            testData[51].stateChanges = [3.5];
            
            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.4);
        });
    });

    describe('Model Validation', () => {
        let model: AnomalyDetectionModel;

        beforeEach(() => {
            model = new AnomalyDetectionModel();
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should validate training data thresholds', async () => {
            const normalData = generateNormalMetrics(200);
            // Introduce invalid thresholds
            normalData[0].pdaValidation = [11.0]; // Above maximum threshold
            normalData[1].accountAccess = [-1.0]; // Below minimum threshold

            await expect(model.train(normalData)).rejects.toThrow('Invalid metric values');
        });

        it('should maintain detection accuracy over time', async () => {
            // Train initial model
            await model.train(generateNormalMetrics(300));
            const initialResult = await model.detect(generateAnomalousMetrics(100));

            // Simulate time passage with new data
            for (let i = 0; i < 5; i++) {
                await model.train(generateNormalMetrics(100));
            }

            const laterResult = await model.detect(generateAnomalousMetrics(100));
            expect(Math.abs(laterResult.confidence - initialResult.confidence)).toBeLessThan(0.1);
        });

        it('should handle boundary conditions in metrics', async () => {
            const edgeCaseData = generateNormalMetrics(100);
            // Set boundary values
            edgeCaseData[50] = {
                ...edgeCaseData[50],
                instructionFrequency: [Number.MAX_SAFE_INTEGER],
                memoryAccess: [Number.MIN_SAFE_INTEGER],
                accountAccess: [0],
                stateChanges: [1e-10],
                timestamp: Date.now()
            };

            await expect(model.train(edgeCaseData)).rejects.toThrow('Invalid metric values');
        });
    });

    describe('Performance and Scale Testing', () => {
        beforeEach(() => {
            model = new AnomalyDetectionModel();
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should handle large datasets efficiently', async () => {
            const largeDataset = generateNormalMetrics(1000);
            const startTime = Date.now();
            
            await model.train(largeDataset);
            const trainingTime = Date.now() - startTime;
            
            expect(trainingTime).toBeLessThan(30000); // Should train under 30 seconds
        });

        it('should maintain accuracy with increasing data size', async () => {
            // Train with small dataset
            await model.train(generateNormalMetrics(200));
            const smallResult = await model.detect(generateAnomalousMetrics(100));
            
            await model.cleanup();
            model = new AnomalyDetectionModel();
            
            // Train with large dataset
            await model.train(generateNormalMetrics(1000));
            const largeResult = await model.detect(generateAnomalousMetrics(100));
            
            // Large dataset should be at least as accurate
            expect(largeResult.confidence).toBeGreaterThanOrEqual(smallResult.confidence);
        });

        it('should efficiently process streaming data', async () => {
            await model.train(generateNormalMetrics(200));
            
            const streamSize = 1000;
            const batchSize = 50;
            let anomalyCount = 0;
            
            for (let i = 0; i < streamSize; i += batchSize) {
                const batch = generateNormalMetrics(batchSize);
                if (i % 100 === 0) {  // Inject anomaly every 100 data points
                    batch[0] = {
                        ...batch[0],
                        instructionFrequency: [10],
                        memoryAccess: [8]
                    };
                }
                
                const result = await model.detect(batch);
                if (result.isAnomaly) anomalyCount++;
            }
            
            expect(anomalyCount).toBeGreaterThan(0);
            expect(anomalyCount).toBeLessThan(streamSize / 50); // Should not have too many false positives
        });
        describe('Dynamic Threshold Adaptation', () => {
            beforeEach(async () => {
                model = new AnomalyDetectionModel();
            });

            afterEach(async () => {
                await model.cleanup();
            });

            it('should adapt thresholds based on historical patterns', async () => {
                // Initial training
                await model.train(generateNormalMetrics(300));
                const initialThresholds = await model.getThresholds();

                // Introduce gradual pattern changes
                for (let i = 0; i < 5; i++) {
                    const data = generateNormalMetrics(100);
                    // Gradually increase normal activity levels
                    data.forEach(metric => {
                        metric.instructionFrequency = [metric.instructionFrequency[0] * 1.1];
                        metric.memoryAccess = [metric.memoryAccess[0] * 1.1];
                    });
                    await model.train(data);
                }

                const adaptedThresholds = await model.getThresholds();
                expect(adaptedThresholds.instructionFrequency).toBeGreaterThan(initialThresholds.instructionFrequency);
                expect(adaptedThresholds.memoryAccess).toBeGreaterThan(initialThresholds.memoryAccess);
            });

            it('should maintain detection accuracy after threshold adaptation', async () => {
                await model.train(generateNormalMetrics(300));
                const initialResult = await model.detect(generateAnomalousMetrics(100));

                // Adapt thresholds
                for (let i = 0; i < 3; i++) {
                    const data = generateNormalMetrics(100);
                    data.forEach(metric => {
                        metric.instructionFrequency = [metric.instructionFrequency[0] * 1.2];
                    });
                    await model.train(data);
                }

                const adaptedResult = await model.detect(generateAnomalousMetrics(100));
                expect(Math.abs(adaptedResult.confidence - initialResult.confidence)).toBeLessThan(0.15);
            });
        });

        it('should handle concurrent operations', async () => {
            const concurrentOps = 5;
            const promises = Array(concurrentOps).fill(null).map(async () => {
                const data = generateNormalMetrics(100);
                await model.train(data);
                return model.detect(data);
            });
            
            const results = await Promise.all(promises);
            expect(results).toHaveLength(concurrentOps);
            results.forEach(result => {
                expect(result).toHaveProperty('isAnomaly');
                expect(result).toHaveProperty('confidence');
            });
        });
    });
