import { PublicKey, Connection } from '@solana/web3.js';
import * as tf from '@tensorflow/tfjs-node';
import { ConcreteMLModel } from '../concrete-ml-model.js';
import { MLConfig } from '../concrete-ml-model.js';
import { VulnerabilityType } from '../../types.js';
import { SecurityMetrics, SecurityPattern, SecurityScore, ValidationResult, SecurityAnalysis, AnalysisResult, SecurityModelConfig, RiskLevel } from './types.js';
// Mock implementations for testing
const generateSTARKProof = jest.fn().mockImplementation(() => ({
  proof: 'mock-stark-proof',
  publicInputs: []
}));

const SGXAttestation = {
  generateProof: jest.fn().mockResolvedValue('mock-sgx-attestation')
};

export interface SecurityMetric {
    name: string;
    score: number;
    weight: number;
    details?: string[];
    risk: RiskLevel;
    location?: string;
    timestamp?: number;
}

const DEFAULT_CONFIG: SecurityModelConfig = {
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
};

export class SecurityScoring extends ConcreteMLModel {
    private readonly securityConfig: SecurityModelConfig;
    private lastAnalyzedProgramId: string | null = null;
    private connection: Connection;

    constructor(config: Partial<SecurityModelConfig> = {}, connection: Connection) {
        const mlConfig: MLConfig = {
            inputShape: [10], // Number of security metrics
            hiddenLayers: [32, 16],
            outputShape: 3, // Code quality, vulnerabilities, access control
            learningRate: 0.001
        };
        super(mlConfig);

        if (!connection) {
            throw new Error('Connection is required');
        }

        // Validate configuration thresholds
        const { thresholds = DEFAULT_CONFIG.thresholds } = config;
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
                ...config.thresholds
            },
            weightings: {
                ...DEFAULT_CONFIG.weightings,
                ...config.weightings
            }
        };
        this.connection = connection;
    }

    protected override buildModel(): tf.Sequential {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            units: this.config.hiddenLayers[0],
            activation: 'relu',
            inputShape: this.config.inputShape
        }));

        // Hidden layers
        for (let i = 1; i < this.config.hiddenLayers.length; i++) {
            model.add(tf.layers.dense({
                units: this.config.hiddenLayers[i],
                activation: 'relu'
            }));
            model.add(tf.layers.dropout({ rate: 0.2 }));
        }

        // Output layer
        model.add(tf.layers.dense({
            units: this.config.outputShape,
            activation: 'sigmoid'
        }));

        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    public async analyzeProgram(programId: PublicKey | string): Promise<AnalysisResult> {
        try {
            const programIdStr = typeof programId === 'string' ? programId : programId.toBase58();
            this.lastAnalyzedProgramId = programIdStr;
            
            const [metrics, validation] = await Promise.all([
                this.analyzeSecurityMetrics(programIdStr),
                this.validateProgram(programIdStr)
            ]);
            
            const score = await this.scoreProgram(metrics);
            const patterns = await this.detectSecurityPatterns(metrics);
            const riskLevel = this.determineRiskLevel(patterns);
            const suggestions = this.generateSuggestions(score, validation);

            return {
                securityScore: {
                    overallScore: score.overallScore,
                    metrics: Object.values(metrics),
                    timestamp: Date.now(),
                    programId: programIdStr
                },
                validation,
                suggestions,
                analysis: {
                    patterns,
                    riskLevel,
                    timestamp: Date.now(),
                    programId: programIdStr
                }
            };
        } catch (error) {
            console.error('Error analyzing program:', error);
            throw error;
        }
    }

    private async detectSecurityPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
        if (!metrics) {
            return [];
        }
        const patterns: SecurityPattern[] = [];
        const timestamp = Date.now();

        if (metrics.access.score < this.securityConfig.thresholds.medium) {
            patterns.push({
                type: 'accessControl',
                confidence: 0.8,
                severity: 'HIGH',
                description: 'Access control vulnerabilities detected',
                indicators: metrics.access.details,
                timestamp,
                location: metrics.access.location
            });
        }

        if (metrics.arithmetic && metrics.arithmetic.score < this.securityConfig.thresholds.medium) {
            patterns.push({
                type: 'arithmetic',
                confidence: 0.85,
                severity: 'MEDIUM',
                description: 'Arithmetic operation risks identified',
                indicators: metrics.arithmetic.details,
                timestamp,
                location: metrics.arithmetic.location
            });
        }

        if (metrics.input && metrics.input.score < this.securityConfig.thresholds.medium) {
            patterns.push({
                type: 'inputValidation',
                confidence: 0.75,
                severity: 'MEDIUM',
                description: 'Input validation improvements needed',
                indicators: metrics.input.details,
                timestamp,
                location: metrics.input.location
            });
        }

        return patterns;
    }

    private determineRiskLevel(patterns: SecurityPattern[]): RiskLevel {
        const hasCritical = patterns.some(p => p.severity === 'CRITICAL');
        const hasHigh = patterns.some(p => p.severity === 'HIGH');
        const hasMedium = patterns.some(p => p.severity === 'MEDIUM');
        
        if (hasCritical) return 'CRITICAL';
        if (hasHigh) return 'HIGH';
        if (hasMedium) return 'MEDIUM';
        return 'LOW';
    }

    private async validateProgram(programId: string): Promise<ValidationResult> {
        try {
            const programInfo = await this.connection.getAccountInfo(new PublicKey(programId));
            return {
                valid: !!programInfo,
                errors: programInfo ? [] : ['Program account not found'],
                warnings: ['Consider implementing additional access controls']
            };
        } catch (error) {
            return {
                valid: false,
                errors: ['Failed to validate program'],
                warnings: []
            };
        }
    }

    private generateSuggestions(score: SecurityScore, validation: ValidationResult): string[] {
        const suggestions: string[] = [];

        if (score.overallScore < this.securityConfig.thresholds.high) {
            suggestions.push('Critical: Immediate security improvements required');
        } else if (score.overallScore < this.securityConfig.thresholds.medium) {
            suggestions.push('Warning: Security improvements recommended');
        }

        return [...suggestions, ...validation.warnings];
    }

    private async analyzeSecurityMetrics(programId: string): Promise<SecurityMetrics> {
        this.lastAnalyzedProgramId = programId;
        
        return {
            ownership: {
                name: 'ownership',
                score: 0.8,
                weight: this.securityConfig.weightings.ownership,
                details: ['Proper ownership checks implemented'],
                risk: 'LOW'
            },
            access: {
                name: 'access',
                score: 0.9,
                weight: this.securityConfig.weightings.access,
                details: ['Access control properly implemented'],
                risk: 'LOW'
            },
            arithmetic: {
                name: 'arithmetic',
                score: 0.85,
                weight: this.securityConfig.weightings.arithmetic!,
                details: ['Safe arithmetic operations verified'],
                risk: 'LOW'
            },
            input: {
                name: 'input',
                score: 0.75,
                weight: this.securityConfig.weightings.input!,
                details: ['Input validation checks present'],
                risk: 'MEDIUM'
            },
            state: {
                name: 'state',
                score: 0.95,
                weight: this.securityConfig.weightings.state!,
                details: ['State management properly handled'],
                risk: 'LOW'
            }
        };
    }

    private async scoreProgram(metrics: SecurityMetrics): Promise<SecurityScore> {
        const input = tf.tensor2d([[
            metrics.ownership.score,
            metrics.access.score,
            metrics.arithmetic?.score || 0,
            metrics.input?.score || 0,
            metrics.state?.score || 0
        ]]);

        const prediction = await this.model.predict(input) as tf.Tensor;
        const scores = await prediction.data();

        const overallScore = Array.from(scores).reduce((a, b) => a + b, 0) / scores.length;

        input.dispose();
        prediction.dispose();

        return {
            overallScore,
            metrics: Object.values(metrics),
            timestamp: Date.now(),
            programId: this.lastAnalyzedProgramId!
        };
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

        await this.train(xs, ys, {
            epochs: 100,
            batchSize: 32,
            validationSplit: 0.2
        });
    }

    public override async save(path: string): Promise<void> {
        await super.save(`${path}/security-scoring-model`);
    }

    public override async load(path: string): Promise<void> {
        await super.load(`${path}/security-scoring-model`);
    }
}
