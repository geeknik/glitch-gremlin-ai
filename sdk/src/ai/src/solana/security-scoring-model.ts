import * as tf from '@tensorflow/tfjs-node';
import { ConcreteMLModel } from '../concrete-ml-model.js';
import { ModelConfig, PredictionResult, TrainingResult } from '../../types.js';
import { PublicKey } from '@solana/web3.js';
import { SecurityMetrics, SecurityPattern, SecurityScore, ValidationResult, SecurityAnalysis, AnalysisResult, RiskLevel } from './types.js';

export interface SecurityModelConfig {
    thresholds: {
        high: number;
        medium: number;
        low: number;
    };
    weightings: {
        codeQuality: number;
        vulnerabilities: number;
        accessControl: number;
    };
}

export interface SecurityAnalysisResult {
    programId: string;
    score: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    timestamp: number;
    details: {
        thresholds: {
            high: number;
            medium: number;
            low: number;
        };
        weightings: {
            codeQuality: number;
            vulnerabilities: number;
            accessControl: number;
        };
        [key: string]: any;
    };
}

const DEFAULT_CONFIG: SecurityModelConfig = {
    thresholds: {
        high: 0.8,
        medium: 0.6,
        low: 0.4
    },
    weightings: {
        codeQuality: 0.3,
        vulnerabilities: 0.4,
        accessControl: 0.3
    }
};

export class SecurityScoringModel extends ConcreteMLModel {
    private readonly securityConfig: SecurityModelConfig;
    private lastAnalyzedProgramId: string | null = null;

    constructor(config: ModelConfig, securityConfig: Partial<SecurityModelConfig> = {}) {
        super(config);

        // Validate configuration thresholds
        const { thresholds = DEFAULT_CONFIG.thresholds } = securityConfig;
        if (thresholds.high <= thresholds.medium || 
            thresholds.medium <= thresholds.low ||
            thresholds.low <= 0) {
            throw new Error('Invalid threshold values - must be high > medium > low > 0');
        }
        if (thresholds.high > 1.0 || thresholds.low < 0.0) {
            throw new Error('Threshold values must be between 0.0 and 1.0');
        }

        this.securityConfig = {
            thresholds: {
                ...DEFAULT_CONFIG.thresholds,
                ...securityConfig.thresholds
            },
            weightings: {
                ...DEFAULT_CONFIG.weightings,
                ...securityConfig.weightings
            }
        };
    }

    protected buildModel(): tf.Sequential {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [20]
        }));

        // Hidden layers
        model.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));

        model.add(tf.layers.dense({
            units: 16,
            activation: 'relu'
        }));

        // Output layer
        model.add(tf.layers.dense({
            units: 1,
            activation: 'sigmoid'
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    public async predict(features: number[][]): Promise<PredictionResult> {
        if (!Array.isArray(features) || !Array.isArray(features[0])) {
            throw new Error('Features must be a 2D array (batch of feature vectors)');
        }
        return await super.predict(features);
    }

    public async train(features: number[][], labels: number[]): Promise<TrainingResult> {
        return await super.train(features, labels);
    }

    public async analyzeProgram(programId: PublicKey | string): Promise<SecurityAnalysisResult> {
        this.lastAnalyzedProgramId = programId.toString();
        
        // Convert program features to tensor format
        const features = await this.extractProgramFeatures(programId);
        const prediction = await this.predict(features);
        
        return {
            programId: programId.toString(),
            score: prediction.confidence,
            riskLevel: this.calculateRiskLevel(prediction.confidence),
            timestamp: Date.now(),
            details: {
                thresholds: this.securityConfig.thresholds,
                weightings: {
                    codeQuality: this.securityConfig.weightings.codeQuality,
                    vulnerabilities: this.securityConfig.weightings.vulnerabilities,
                    accessControl: this.securityConfig.weightings.accessControl
                },
                ...prediction.details
            }
        };
    }

    private calculateRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        const { thresholds } = this.securityConfig;
        if (score >= thresholds.high) return 'LOW';
        if (score >= thresholds.medium) return 'MEDIUM';
        if (score >= thresholds.low) return 'HIGH';
        return 'CRITICAL';
    }

    private async extractProgramFeatures(programId: PublicKey | string): Promise<number[][]> {
        // Implementation of feature extraction
        // This should analyze the program and return a feature vector
        return [new Array(20).fill(0)]; // Return a batch of one feature vector
    }

    public async trainOnHistoricalData(
        auditedPrograms: { metrics: SecurityMetrics; scores: number[] }[]
    ): Promise<void> {
        const xs = auditedPrograms.map(p => [
            p.metrics.ownership.score,
            p.metrics.access.score,
            p.metrics.arithmetic?.score || 0,
            p.metrics.input?.score || 0,
            p.metrics.state?.score || 0
        ]);
        const ys = auditedPrograms.map(p => p.scores);

        await this.train(xs, ys);
    }

    public override async save(path: string): Promise<void> {
        await super.save(`${path}/security-scoring-model`);
    }

    public override async load(path: string): Promise<void> {
        await super.load(`${path}/security-scoring-model`);
    }
}
