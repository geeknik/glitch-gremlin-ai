import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import { AnomalyDetectionModel } from '../src/anomaly-detection';

interface TimeSeriesMetrics {
    instructionFrequency: number[];
    memoryAccess: number[];
    accountAccess: number[];
    stateChanges: number[];
    pdaValidation?: number[];
    accountDataMatching?: number[];
    cpiSafety?: number[];
    authorityChecks?: number[];
    timestamp: number;
}

interface AnomalyDetectionResult {
    isAnomaly: boolean;
    confidence: number;
    details: AnomalyDetailsItem[];
}

interface AnomalyDetailsItem {
    type: string;
    score: number;
    threshold: number;
    confidence?: number;
    correlatedPatterns?: string[];
}

import { TimeSeriesMetric } from '../src/types';

describe('AnomalyDetectionModel', () => {
    let model: AnomalyDetectionModel;
    const testModelPath = './test-model';

    beforeEach(() => {
        model = new AnomalyDetectionModel();
    });

    afterEach(async () => {
        await model.cleanup();
    });

    const generateNormalMetrics = (count: number): TimeSeriesMetric[] => {
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
        }))
    };

    const generateAnomalousMetrics = (count: number): TimeSeriesMetric[] => {
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
            await model.train(generateNormalMetrics(200));
        });

        it('should detect normal behavior', async () => {
            const normalData = generateNormalMetrics(100);
            const result = await model.detect(normalData);

            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.5);
            expect(result.details).toBeDefined();
        });

        it('should detect anomalous behavior', async () => {
            const anomalousData = generateAnomalousMetrics(100);
            const result = await model.detect(anomalousData);

            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.5);
            expect(result.details).toBeDefined();
        });

        it('should throw error if model is not trained', async () => {
            await model.cleanup();
            const testData = generateNormalMetrics(100);
            await expect(model.detect(testData)).rejects.toThrow('Model not trained');
        });

        it('should throw error with insufficient data points', async () => {
            const testData = generateNormalMetrics(50);
            await expect(model.detect(testData)).rejects.toThrow('Insufficient data points');
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
                timestamp: Date.now()
            }];
            await expect(model.train(incompleteMetrics as any)).rejects.toThrow('Missing required metrics fields');
        });
    });

    describe('Security Pattern Detection', () => {
        beforeEach(async () => {
            await model.train(generateNormalMetrics(200));
        });

        it('should detect PDA validation issues', async () => {
            const testData = generateNormalMetrics(100);
            testData[50].pdaValidation = [9.5];
            const result = await model.detect(testData);

            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'pdaValidation')).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0.7);
        });

        it('should detect account data matching vulnerabilities', async () => {
            const testData = generateNormalMetrics(100);
            testData[50].accountDataMatching = [8.5];
            const result = await model.detect(testData);

            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'accountDataMatching')).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0.6);
        });

        it('should detect unsafe CPI patterns', async () => {
            const testData = generateNormalMetrics(100);
            testData[50].cpiSafety = [7.5];
            const result = await model.detect(testData);

            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'cpiSafety')).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0.65);
        });

        it('should detect authority validation issues', async () => {
            const testData = generateNormalMetrics(100);
            testData[50].authorityChecks = [6.5];
            const result = await model.detect(testData);

            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'authorityChecks')).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0.75);
        });

        it('should detect combined vulnerability patterns', async () => {
            const testData = generateNormalMetrics(100);
            testData[50] = {
                ...testData[50],
                pdaValidation: [8.0],
                accountDataMatching: [7.5],
                cpiSafety: [6.5],
                authorityChecks: [5.5]
            };
            const result = await model.detect(testData);

            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.85);
            expect(result.details.filter(d => d.score > 0.6)).toHaveLength(4);
        });

        it('should perform correlation analysis between different vulnerabilities', async () => {
            const testData = generateNormalMetrics(100);
            testData[50].pdaValidation = [8.5];
            testData[51].accountDataMatching = [7.5];
            testData[52].cpiSafety = [6.5];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.some(d => d.correlatedPatterns?.length > 0)).toBe(true);
        });
    });

    describe('save/load', () => {
        beforeEach(async () => {
            await model.train(generateNormalMetrics(200));
        });

        it('should save and load model successfully', async () => {
            await model.save(testModelPath);
            await model.cleanup();
            await expect(model.load(testModelPath)).resolves.not.toThrow();

            const testData = generateNormalMetrics(100);
            const result = await model.detect(testData);
            expect(result).toBeDefined();
            expect(result.isAnomaly).toBeDefined();
            expect(result.confidence).toBeDefined();
        });

        it('should throw error when saving untrained model', async () => {
            await model.cleanup();
            await expect(model.save(testModelPath)).rejects.toThrow('Model not trained');
        });

        it('should throw error when loading from invalid path', async () => {
            await expect(model.load('./nonexistent-path')).rejects.toThrow('Model file not found');
        });

        it('should handle corrupted model files', async () => {
            await fs.promises.writeFile(`${testModelPath}/model.json`, 'invalid json');
            await expect(model.load(testModelPath)).rejects.toThrow('Invalid model format');
        });

        it('should maintain model performance after save/load', async () => {
            const testData = generateNormalMetrics(100);
            const beforeSave = await model.detect(testData);

            await model.save(testModelPath);
            await model.cleanup();
            await model.load(testModelPath);

            const afterLoad = await model.detect(testData);

            expect(afterLoad.isAnomaly).toBe(beforeSave.isAnomaly);
            expect(afterLoad.confidence).toBeCloseTo(beforeSave.confidence, 2);
        });
    });

    describe('Resource Management', () => {
        let modelInstances: AnomalyDetectionModel[] = [];

        afterEach(async () => {
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

            expect(tf.memory().numBytes).toBeLessThan(initialMemory * 1.1);
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
            testData[50].instructionFrequency = [15.0];
            testData[51].instructionFrequency = [12.0];
            testData[52].instructionFrequency = [10.0];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.find(d => d.type === 'instructionFrequency')?.score).toBeGreaterThan(0.8);
        });

        it('should identify suspicious state change patterns', async () => {
            const testData = generateNormalMetrics(100);
            testData[45].stateChanges = [8.0];
            testData[46].accountAccess = [7.0];
            testData[47].memoryAccess = [6.0];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.details.some(d => d.correlatedPatterns?.length >= 2)).toBe(true);
        });

        it('should detect unusual account access sequences', async () => {
            const testData = generateNormalMetrics(100);
            for (let i = 40; i < 45; i++) {
                testData[i].accountAccess = [6.0];
                testData[i].authorityChecks = [5.0];
            }

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.7);
        });
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
            testData[50].instructionFrequency = [4.0];
            testData[50].stateChanges = [3.5];

            const result = await model.detect(testData);
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBeLessThan(0.4);
        });

        it('should not flag legitimate high-volume transactions', async () => {
            const testData = generateNormalMetrics(100);
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

        beforeEach(async () => {
            model = new AnomalyDetectionModel();
            await model.train(generateNormalMetrics(200));
        });

        afterEach(async () => {
            await model.cleanup();
        });

        it('should validate model architecture', async () => {
            await expect(model.validateModel()).resolves.not.toThrow();
        });

        it('should throw error if model is not trained', async () => {
            await model.cleanup();
            await expect(model.validateModel()).rejects.toThrow('Model not properly initialized');
        });

        it('should throw error if normalization stats are missing', async () => {
            await model.cleanup();
            await model.initialize();
            await expect(model.validateModel()).rejects.toThrow('Normalization statistics not properly loaded');
        });
    });
});
