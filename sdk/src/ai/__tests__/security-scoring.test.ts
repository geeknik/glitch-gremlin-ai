import * as tf from '@tensorflow/tfjs-node';
import { Connection } from '@solana/web3.js';
import { SecurityScoring } from '../src/solana/security-scoring-model.js';
import { SecurityMetrics, SecurityScore, SecurityAnalysis, RiskLevel, SecurityMetric } from '../src/solana/types.js';
import { VulnerabilityType } from '../types.js';
import mockTf from '../__mocks__/@tensorflow/tfjs-node';

// Mock TensorFlow.js and force CPU backend
jest.mock('@tensorflow/tfjs-node', () => {
    process.env.TF_CPP_MIN_LOG_LEVEL = '2';
    process.env.TF_FORCE_CPU = '1';
    return mockTf;
});

    const mockDense = {
        apply: jest.fn(),
        getConfig: () => ({}),
        name: 'dense'
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

    return {
        layers: {
            dense: jest.fn().mockReturnValue(mockDense)
        },
        sequential: jest.fn().mockReturnValue(mockModel),
        tensor2d: jest.fn().mockReturnValue(mockTensor),
        train: {
            adam: jest.fn().mockReturnValue({})
        },
        loadLayersModel: jest.fn().mockResolvedValue(mockModel)
    };
});

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
        expect(tf.layers.dense).toHaveBeenCalledTimes(3);
    });

    test('should analyze program correctly', async () => {
        const analysis = await securityScoring.analyzeProgram('11111111111111111111111111111111');

        expect(analysis).toBeDefined();
        expect(analysis.securityScore).toBeDefined();
        expect(analysis.analysis.patterns).toBeDefined();
        expect(analysis.analysis.riskLevel).toBeDefined();
        expect(analysis.suggestions).toBeInstanceOf(Array);

        const findings = analysis.analysis.patterns;
        expect(findings.some((p: { type: string }) => p.type === VulnerabilityType.ARITHMETIC_OVERFLOW)).toBe(true);
        expect(findings.some((p: { type: string }) => p.type === VulnerabilityType.ACCESS_CONTROL)).toBe(true);
        expect(findings.some((p: { type: string }) => p.type === VulnerabilityType.PDA_VALIDATION)).toBe(true);
    });
});
