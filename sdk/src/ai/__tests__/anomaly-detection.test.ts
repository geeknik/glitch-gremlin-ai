import * as tf from '@tensorflow/tfjs-node';
import { AnomalyDetector } from '../src/anomaly-detection.js';
import { TimeSeriesMetric, ModelConfig } from '../src/anomaly-detection.js';

// Interface definitions
interface MockLayerConfig {
    units?: number;
    activation?: string;
    inputShape?: number[];
    returnSequences?: boolean;
}

interface MockTensor {
    sub: jest.Mock;
    div: jest.Mock;
    square: jest.Mock;
    mean: jest.Mock;
    dataSync: jest.Mock;
    dispose: jest.Mock;
    shape: number[];
}

interface MockLayer {
    apply: jest.Mock;
    getConfig: jest.Mock;
    dispose: jest.Mock;
}

interface MockModel {
    add: jest.Mock;
    compile: jest.Mock;
    fit: jest.Mock;
    predict: jest.Mock;
    dispose: jest.Mock;
    layers: MockLayer[];
    save: jest.Mock;
}
// Mock helper classes
class TensorTracker {
    private static disposed = new Set<MockTensor>();

    static markDisposed(tensor: MockTensor): void {
        this.disposed.add(tensor);
    }

    static isDisposed(tensor: MockTensor): boolean {
        return this.disposed.has(tensor);
    }

    static reset(): void {
        this.disposed.clear();
    }
}

const createMockTensor = (shape: number[] = [1, 1]): MockTensor => {
    const tensor: MockTensor = {
        sub: jest.fn(),
        div: jest.fn(),
        square: jest.fn(),
        mean: jest.fn(),
        dataSync: jest.fn(),
        dispose: jest.fn(),
        shape
    };

    // Set up method chaining with self-references to avoid infinite recursion
    const mockReturn = {
        ...tensor,
        shape: [1]
    };
    tensor.sub.mockReturnValue(mockReturn);
    tensor.div.mockReturnValue(mockReturn);
    tensor.square.mockReturnValue(mockReturn);
    tensor.mean.mockReturnValue(mockReturn);
    tensor.dataSync.mockReturnValue(new Float32Array([0.1]));
    tensor.dispose.mockImplementation(() => {
        TensorTracker.markDisposed(tensor);
    });

    return tensor;
};

const createMockLayer = (config: MockLayerConfig): MockLayer => ({
    apply: jest.fn(),
    getConfig: jest.fn().mockReturnValue(config),
    dispose: jest.fn()
});

const createLayerModel = (): MockModel => {
    const model: MockModel = {
        add: jest.fn(),
        compile: jest.fn(),
        fit: jest.fn(),
        predict: jest.fn(),
        dispose: jest.fn(),
        layers: [],
        save: jest.fn()
    };

    model.add.mockImplementation((layer: MockLayer) => {
        model.layers.push(layer);
        return model;
    });
    
    model.compile.mockReturnThis();
    model.fit.mockResolvedValue({
        history: {
            loss: [0.1, 0.08, 0.06],
            val_loss: [0.2, 0.15, 0.12]
        }
    });
    model.predict.mockReturnValue(createMockTensor());
    model.save.mockResolvedValue(undefined);

    return model;
};
// Mock TensorFlow
const mockModel = {
    add: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnThis(),
    fit: jest.fn().mockResolvedValue({
        history: {
            loss: [0.1, 0.08, 0.06],
            val_loss: [0.2, 0.15, 0.12]
        }
    }),
    predict: jest.fn().mockReturnValue(createMockTensor()),
    dispose: jest.fn()
};


const tf = {
    sequential: jest.fn().mockImplementation(() => ({
        add: jest.fn().mockReturnThis(),
        compile: jest.fn().mockReturnThis(),
        fit: jest.fn().mockResolvedValue({
            history: {
                loss: [0.1, 0.08, 0.06],
                val_loss: [0.2, 0.15, 0.12]
            }
        }),
        predict: jest.fn().mockReturnValue(createMockTensor()),
        dispose: jest.fn(),
        layers: [],
        save: jest.fn().mockResolvedValue(undefined)
    })),
    layers: {
        dense: jest.fn().mockImplementation((config) => {
            return {
                apply: jest.fn(),
                getConfig: jest.fn().mockReturnValue(config),
                dispose: jest.fn()
            };
        }),
        lstm: jest.fn().mockImplementation((config) => {
            return {
                apply: jest.fn(),
                getConfig: jest.fn().mockReturnValue(config),
                dispose: jest.fn()
            };
        })
    },
    train: {
        adam: jest.fn().mockReturnValue({
            getConfig: jest.fn().mockReturnValue({ learningRate: 0.001 })
        })
    },
    tensor2d: jest.fn().mockImplementation((data, shape) => createMockTensor(shape)),
    tensor1d: jest.fn().mockImplementation((data) => createMockTensor([data.length])),
    tensor3d: jest.fn().mockImplementation((data, shape) => createMockTensor(shape)),
    moments: jest.fn().mockReturnValue({
        mean: createMockTensor([1]),
        variance: createMockTensor([1])
    }),
    sqrt: jest.fn().mockReturnValue(createMockTensor([1])),
    tidy: jest.fn().mockImplementation((fn) => fn())
};

jest.mock('@tensorflow/tfjs-node', () => tf);

// Override default config for tests
const defaultTestConfig: ModelConfig = {
    inputSize: 9,
    featureSize: 5,
    timeSteps: 10,
    encoderLayers: [64, 32, 16],
    decoderLayers: [16, 32, 64],
    lstmUnits: 100,
    dropoutRate: 0.2,
    batchSize: 32,
    epochs: 50,
    learningRate: 0.001,
    validationSplit: 0.2,
    anomalyThreshold: 0.5,
    sensitivityLevel: 0.5,
    adaptiveThresholding: true,
    featureEngineering: {
        enableTrending: true,
        enableSeasonality: true,
        enableCrossCorrelation: true,
        windowSize: 10
    },
    enableGPU: false,
    tensorflowMemoryOptimization: true,
    cacheSize: 1000
};

describe('AnomalyDetector', () => {
    let detector: AnomalyDetector;
    let mockData: TimeSeriesMetric[];

    beforeEach(() => {
        jest.clearAllMocks();
        TensorTracker.reset();
        detector = new AnomalyDetector(defaultTestConfig);
        mockData = Array.from({ length: 10 }, () => ({
            instructionFrequency: [1],
            executionTime: [1],
            memoryUsage: [1],
            cpuUtilization: [1],
            errorRate: [1],
            pdaValidation: [1],
            accountDataMatching: [1],
            cpiSafety: [1],
            authorityChecks: [1],
            timestamp: Date.now()
        }));
        
        // Initialize models
        detector['models'] = {
            autoencoder: createLayerModel(),
            lstm: createLayerModel()
        };
    });

    afterEach(async () => {
        if (detector) {
            await detector.cleanup();
        }
    });

    describe('initialization', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('should create detector with default configuration', () => {
            const detector = new AnomalyDetector();
            expect(detector).toBeDefined();
            expect(detector['isInitialized']).toBe(true);
            expect(detector['dataWindow']).toEqual([]);
            expect(detector['mean']).toBe(0);
            expect(detector['stdDev']).toBe(0);
        });

        test('should create detector with custom configuration', () => {
            const config = {
                windowSize: 100,
                zScoreThreshold: 2.5,
                minSampleSize: 20,
                sensitivityLevel: 0.8
            };
            const detector = new AnomalyDetector(config);
            expect(detector).toBeDefined();
            expect(detector['isInitialized']).toBe(true);
            expect(detector['config']).toEqual(config);
        });

        test('should validate configuration parameters', () => {
            expect(() => {
                new AnomalyDetector({ ...defaultTestConfig, inputSize: -1 });
            }).toThrow();

            expect(() => {
                new AnomalyDetector({ ...defaultTestConfig, anomalyThreshold: 1.5 });
            }).toThrow('Anomaly threshold must be between 0 and 1');

            expect(() => {
                new AnomalyDetector({ ...defaultTestConfig, timeSteps: 0 });
            }).toThrow('Time steps must be positive');

            expect(() => {
                new AnomalyDetector({ ...defaultTestConfig, dropoutRate: -0.1 });
            }).toThrow('Dropout rate must be between 0 and 1');
        });

        test('should handle invalid encoder/decoder layers', () => {
            expect(() => {
                new AnomalyDetector({ ...defaultTestConfig, encoderLayers: [] });
            }).toThrow('Encoder layers cannot be empty');

            expect(() => {
                new AnomalyDetector({ ...defaultTestConfig, decoderLayers: [] });
            }).toThrow('Decoder layers cannot be empty');
        });
    });

    describe('training and detection', () => {

        test('should train successfully', async () => {
            const mockData = Array.from({ length: 100 }, (_, i) => ({
                instructionFrequency: [Math.random()],
                executionTime: [Math.random()],
                memoryUsage: [Math.random()],
                cpuUtilization: [Math.random()],
                errorRate: [Math.random()],
                pdaValidation: [Math.random()],
                accountDataMatching: [Math.random()],
                cpiSafety: [Math.random()],
                authorityChecks: [Math.random()],
                timestamp: Date.now() + i * 1000
            }));
            
            await detector.train(mockData);
            expect(detector['isInitialized']).toBe(true);
            expect(detector['dataWindow'].length).toBeGreaterThan(0);
            expect(detector['mean']).not.toBe(0);
            expect(detector['stdDev']).not.toBe(0);
        });

        test('should handle empty training data', async () => {
            await expect(detector.train([])).rejects.toThrow('Training data is empty');
        });

        test('should handle invalid training data', async () => {
            const mockMetric = {
                instructionFrequency: [],
                executionTime: [1],
                memoryUsage: [1],
                cpuUtilization: [1],
                errorRate: [1],
                pdaValidation: [1],
                accountDataMatching: [1],
                cpiSafety: [1],
                authorityChecks: [1],
                timestamp: Date.now()
            };
            await expect(detector.train([mockMetric])).rejects.toThrow('Invalid metric data');
        });

        test('should detect anomalies', async () => {
            const mockData = Array.from({ length: 100 }, (_, i) => ({
                instructionFrequency: [Math.random() * 10],
                executionTime: [Math.random() * 100],
                memoryUsage: [Math.random() * 1000],
                cpuUtilization: [Math.random() * 100],
                errorRate: [Math.random()],
                pdaValidation: [Math.random()],
                accountDataMatching: [Math.random()],
                cpiSafety: [Math.random()],
                authorityChecks: [Math.random()],
                timestamp: Date.now() + i * 1000
            }));

            await detector.train(mockData);
            const result = await detector.detect(mockData);
            expect(result.isAnomaly).toBeDefined();
            expect(result.score).toBeDefined();
            expect(result.metrics).toBeDefined();
            expect(Array.isArray(result.metrics)).toBe(true);
            expect(result.timestamp).toBeDefined();
        });

        test('should handle detection without training', async () => {
            const mockData = [{
                instructionFrequency: [1],
                executionTime: [1],
                memoryUsage: [1],
                cpuUtilization: [1],
                errorRate: [1],
                pdaValidation: [1],
                accountDataMatching: [1],
                cpiSafety: [1],
                authorityChecks: [1],
                timestamp: Date.now()
            }];
            await expect(async () => {
                await detector.detect(mockData);
            }).rejects.toThrow('Not enough samples for detection');
        });

        test('should handle invalid detection data', async () => {
            const mockData = Array.from({ length: 10 }, () => ({
                instructionFrequency: [1],
                executionTime: [1],
                memoryUsage: [1],
                cpuUtilization: [1],
                errorRate: [1],
                pdaValidation: [1],
                accountDataMatching: [1],
                cpiSafety: [1],
                authorityChecks: [1],
                timestamp: Date.now()
            }));
            detector.train(mockData);
            
            const invalidData = [{
                ...mockData[0],
                instructionFrequency: []
            }];
            await expect(detector.detect(invalidData)).rejects.toThrow('Invalid metric data');
        });
    });

    describe('cleanup', () => {
        test('should cleanup resources', async () => {
            await detector.train(mockData);
            
            const autoencoder = detector['models'].autoencoder;
            const lstm = detector['models'].lstm;
            
            // Mock dispose methods
            if (autoencoder) autoencoder.dispose = jest.fn();
            if (lstm) lstm.dispose = jest.fn();
            
            await detector.cleanup();
            
            expect(detector['models'].autoencoder).toBeNull();
            expect(detector['models'].lstm).toBeNull();
            expect(detector['isInitialized']).toBe(false);
            
            if (autoencoder?.dispose) {
                expect(autoencoder.dispose).toHaveBeenCalled();
            }
            if (lstm?.dispose) {
                expect(lstm.dispose).toHaveBeenCalled();
            }
        });

        test('should handle multiple cleanup calls', async () => {
            await detector.cleanup();
            await detector.cleanup();
            // Second cleanup should not throw
            await detector.cleanup();
        });

        test('should cleanup after failed training', async () => {
            const invalidData = [{ ...mockData[0], instructionFrequency: [] }];
            await expect(detector.train(invalidData)).rejects.toThrow();
            expect(detector['models'].autoencoder).toBeNull();
            expect(detector['models'].lstm).toBeNull();
        });
    });

    describe('event handling', () => {
        test('should emit training progress events', async () => {
            const progressCallback = jest.fn();
            detector.on('trainingProgress', progressCallback);
            
            await detector.train(mockData);
            
            expect(progressCallback).toHaveBeenCalled();
            expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({
                epoch: expect.any(Number),
                loss: expect.any(Number)
            }));
        });

        test('should emit anomaly detection events', async () => {
            const detectionCallback = jest.fn();
            detector.on('anomalyDetected', detectionCallback);
            
            await detector.train(mockData);
            await detector.detect(mockData);
            
            expect(detectionCallback).toHaveBeenCalled();
            expect(detectionCallback).toHaveBeenCalledWith(expect.objectContaining({
                isAnomaly: expect.any(Boolean),
                confidence: expect.any(Number),
                details: expect.any(Object)
            }));
        });
    });
});
