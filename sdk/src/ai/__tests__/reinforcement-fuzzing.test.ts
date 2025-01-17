import * as tf from '@tensorflow/tfjs-node';
import { RLFuzzingModel } from '../reinforcement-fuzzing.js';
import { FuzzingState } from '../types.js';

const createMockModel = () => ({
    add: jest.fn(),
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({ 
        history: { 
            loss: [0.1]
        }
    }),
    predict: jest.fn(() => ({
        data: jest.fn().mockResolvedValue(new Float32Array([0.2, 0.3, 0.1, 0.2, 0.2])),
        dataSync: jest.fn().mockReturnValue([0]),
        dispose: jest.fn()
    })),
    dispose: jest.fn(),
    getWeights: jest.fn().mockReturnValue([]),
    setWeights: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined)
});

const mockMainModel = createMockModel();
const mockTargetModel = createMockModel();

const mockTf = {
    sequential: jest.fn()
        .mockImplementationOnce(() => mockMainModel)    // First call returns main network
        .mockImplementationOnce(() => mockTargetModel), // Second call returns target network
    layers: {
        dense: jest.fn().mockReturnValue({
            apply: jest.fn()
        }),
        dropout: jest.fn().mockReturnValue({
            apply: jest.fn()
        })
    },
    train: {
        adam: jest.fn().mockReturnValue({
            getConfig: jest.fn().mockReturnValue({ learningRate: 0.001 })
        })
    },
    tensor2d: jest.fn(() => ({
        dispose: jest.fn()
    })),
    tensor1d: jest.fn(() => ({
        dispose: jest.fn()
    })),
    dispose: jest.fn(),
    loadLayersModel: jest.fn().mockResolvedValue(mockMainModel),
    tidy: jest.fn((fn: () => any) => fn()),
    argMax: jest.fn(() => ({
        dataSync: jest.fn().mockReturnValue([0]),
        dispose: jest.fn()
    })),
    concat: jest.fn(() => ({
        dispose: jest.fn()
    })),
    tensor: jest.fn(() => ({
        dispose: jest.fn()
    }))
};

jest.mock('@tensorflow/tfjs-node', () => mockTf);

describe('RLFuzzingModel', () => {
    let model: RLFuzzingModel;
    const mockState: FuzzingState = {
        programCounter: 0,
        coverage: Array(10).fill(0),
        lastCrash: null,
        mutationHistory: [],
        executionTime: 0
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset sequential mock to return new models for each test
        mockTf.sequential
            .mockImplementationOnce(() => createMockModel())
            .mockImplementationOnce(() => createMockModel());
        model = new RLFuzzingModel({
            stateSize: 10,
            actionSize: 5,
            batchSize: 32,
            memorySize: 1000,
            gamma: 0.95,
            learningRate: 0.001,
        });
    });

    afterEach(() => {
        if (model) {
            model.dispose();
        }
        jest.resetAllMocks();
    });

    describe('initialization', () => {
        test('should create model with correct configuration', async () => {
            expect(model).toBeDefined();
            expect(model.stateSize).toBe(10);
            expect(model.actionSize).toBe(5);
            expect(model.batchSize).toBe(32);
            expect(model.memorySize).toBe(1000);
            expect(model.gamma).toBe(0.95);
            expect(model.learningRate).toBe(0.001);
            expect(mockTf.sequential).toHaveBeenCalledTimes(2); // Main and target networks
        });

        test('should throw error with invalid configuration', () => {
            expect(() => {
                new RLFuzzingModel({
                    stateSize: -1,
                    actionSize: 5,
                    batchSize: 32,
                    memorySize: 1000,
                    gamma: 0.95,
                    learningRate: 0.001,
                });
            }).toThrow('Invalid state size');
        });
    });

    describe('action selection', () => {
        test('should select valid action based on state', async () => {
            const action = await model.selectAction(mockState);
            expect(action).toBeGreaterThanOrEqual(0);
            expect(action).toBeLessThan(5);
        });

        test('should handle exploration vs exploitation', async () => {
            // Test exploration
            model.epsilon = 1.0;
            const explorationAction = await model.selectAction(mockState);
            expect(explorationAction).toBeGreaterThanOrEqual(0);
            expect(explorationAction).toBeLessThan(5);

            // Test exploitation
            model.epsilon = 0.0;
            const exploitationAction = await model.selectAction(mockState);
            expect(exploitationAction).toBeGreaterThanOrEqual(0);
            expect(exploitationAction).toBeLessThan(5);
        });

        test('should decay epsilon over time', async () => {
            const initialEpsilon = model.epsilon;
            await model.selectAction(mockState);
            expect(model.epsilon).toBeLessThan(initialEpsilon);
        });
    });

    describe('memory management', () => {
        test('should add experience to memory', () => {
            model.remember(mockState, 1, 1.0, mockState, false);
            expect(model.memory.length).toBe(1);
        });

        test('should respect maximum memory size', () => {
            for (let i = 0; i < 1100; i++) {
                const state = { ...mockState, programCounter: i };
                const nextState = { ...mockState, programCounter: i + 1 };
                model.remember(state, 1, 1.0, nextState, false);
            }
            expect(model.memory.length).toBe(1000);
        });
    });

    describe('training', () => {
        test('should train on batch of experiences', async () => {
            // Add experiences to memory
            for (let i = 0; i < 50; i++) {
                const state = { ...mockState, programCounter: i };
                const nextState = { ...mockState, programCounter: i + 1 };
                model.remember(state, i % 5, 1.0, nextState, false);
            }

            await model.train();
            expect(mockMainModel.fit).toHaveBeenCalled();
        });

        test('should skip training with insufficient memory', async () => {
            await model.train();
            expect(mockMainModel.fit).not.toHaveBeenCalled();
        });

        test('should update target model periodically', async () => {
            // Add enough experiences
            for (let i = 0; i < 50; i++) {
                const state = { ...mockState, programCounter: i };
                model.remember(state, i % 5, 1.0, state, false);
            }

            // Train multiple times
            for (let i = 0; i < 10; i++) {
                await model.train();
            }

            expect(mockMainModel.getWeights).toHaveBeenCalled();
        });
    });

    describe('model persistence', () => {
        test('should save model weights', async () => {
            await model.saveModel('test-model');
            expect(mockMainModel.save).toHaveBeenCalled();
        });

        test('should load model weights', async () => {
            await model.loadModel('test-model');
            expect(mockMainModel.compile).toHaveBeenCalled();
        });

        test('should handle loading errors gracefully', async () => {
            mockTf.loadLayersModel.mockRejectedValueOnce(new Error('File not found'));
            await expect(model.loadModel('non-existent-model')).rejects.toThrow('Failed to load model');
        });
    });

    describe('resource management', () => {
        test('should dispose tensors properly', () => {
            model.dispose();
            expect(mockMainModel.dispose).toHaveBeenCalled();
        });

        test('should handle multiple dispose calls safely', () => {
            model.dispose();
            expect(() => model.dispose()).not.toThrow();
        });
    });
});
