import { Connection } from '@solana/web3.js';
import { SecurityScoring } from '../src/solana/security-scoring-model';
import { SecurityMetrics, SecurityMetric } from '../src/solana/types';
import { VulnerabilityType } from '../types';

// Import the mock directly
jest.mock('@tensorflow/tfjs-node', () => {
    const actual = jest.requireActual('@tensorflow/tfjs-node');
    return {
        ...actual,
        // Add any specific mock implementations needed
        sequential: jest.fn(),
        layers: {
            dense: jest.fn()
        }
    };
});

// Set TensorFlow environment variables
beforeAll(() => {
    process.env.TF_CPP_MIN_LOG_LEVEL = '2';
    process.env.TF_FORCE_CPU = '1';
});

// Mock TensorFlow specific methods
const mockTensor = {
    shape: [1],
    dataSync: jest.fn(),
    dispose: jest.fn()
};

const mockModel = {
    add: jest.fn(),
    compile: jest.fn(),
    fit: jest.fn().mockResolvedValue({ history: { loss: [0.1] } }),
    predict: jest.fn().mockReturnValue(mockTensor),
    dispose: jest.fn(),
    layers: [],
    save: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue(undefined)
};

jest.spyOn(tf, 'sequential').mockImplementation(() => mockModel);
jest.spyOn(tf.layers, 'dense').mockImplementation(() => ({
    apply: jest.fn(),
    getConfig: () => ({}),
    name: 'dense'
}));

// Mock Connection
const mockConnection = {
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getProgramAccounts: jest.fn().mockResolvedValue([]),
    getSlot: jest.fn().mockResolvedValue(1)
} as unknown as Connection;

describe('SecurityScoring', () => {
    let securityScoring: SecurityScoring;
    let mockMetrics: SecurityMetrics;

    beforeEach(() => {
        securityScoring = new SecurityScoring({
            thresholds: {
                high: 0.8,
                medium: 0.6,
                low: 0.4
            },
            weightings: {
                ownership: 0.6,
                access: 0.4,
                arithmetic: 0.5,
                input: 0.3,
                state: 0.4
            }
        }, mockConnection);
        
        const baseMetric: SecurityMetric = {
            name: 'Test Metric',
            score: 0.8,
            weight: 1.0,
            details: [],
            risk: 'LOW',
            timestamp: Date.now()
        };

        mockMetrics = {
            ownership: { ...baseMetric, name: 'Ownership' },
            access: { ...baseMetric, name: 'Access Control' },
            arithmetic: { ...baseMetric, name: 'Arithmetic Safety' },
            input: { ...baseMetric, name: 'Input Validation' },
            state: { ...baseMetric, name: 'State Management' }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize with correct model configuration', () => {
        expect(tf.sequential).toHaveBeenCalled();
        expect(tf.layers.dense).toHaveBeenCalledWith({
            units: 64,
            activation: 'relu',
            inputShape: [5] // Number of metrics
        });
        expect(tf.layers.dense).toHaveBeenCalledWith({
            units: 32,
            activation: 'relu'
        });
        expect(tf.layers.dense).toHaveBeenCalledWith({
            units: 1,
            activation: 'sigmoid'
        });
    });

    test('should analyze program and return valid security score', async () => {
        const programId = '11111111111111111111111111111111';
        const analysis = await securityScoring.analyzeProgram(programId);

        expect(analysis).toBeDefined();
        expect(analysis.securityScore).toBeGreaterThanOrEqual(0);
        expect(analysis.securityScore).toBeLessThanOrEqual(1);
        
        expect(analysis.analysis).toBeDefined();
        expect(analysis.analysis.riskLevel).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
        
        expect(analysis.suggestions).toBeInstanceOf(Array);
        analysis.suggestions.forEach(suggestion => {
            expect(suggestion).toHaveProperty('description');
            expect(suggestion).toHaveProperty('priority');
        });

        // Verify connection was used
        expect(mockConnection.getAccountInfo).toHaveBeenCalledWith(programId);
    });

    test('should handle program analysis errors gracefully', async () => {
        mockConnection.getAccountInfo.mockRejectedValueOnce(new Error('Network error'));
        
        await expect(securityScoring.analyzeProgram('11111111111111111111111111111111'))
            .rejects
            .toThrow('Failed to analyze program');
    });
});
