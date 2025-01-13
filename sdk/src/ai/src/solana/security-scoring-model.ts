import { PublicKey } from '@solana/web3.js';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SecurityModelConfig {
    thresholds: {
        high: number;
        medium: number;
        low: number;
    };
    weightings: {
        ownership: number;
        access: number;
        arithmetic?: number;
        input?: number;
        state?: number;
    };
}

export interface SecurityScore {
    score: number;
    weight: number;
    risk: RiskLevel;
    details?: string[];
    location?: string;
}

export interface SecurityMetrics {
    access: SecurityScore;
    ownership: SecurityScore;
    arithmetic?: SecurityScore;
    input?: SecurityScore;
    state?: SecurityScore;
}

export interface SecurityPattern {
    type: string;
    severity: RiskLevel;
    description: string;
    timestamp: number;
    confidence?: number;
    indicators?: string[];
    location?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface SecurityAnalysis {
    patterns: SecurityPattern[];
    riskLevel: RiskLevel;
    timestamp: Date;
    programId: string;
}

export interface AnalysisResult {
    score: SecurityScore;
    riskLevel: RiskLevel;
    patterns: string[];
    suggestions: string[];
    validation: ValidationResult;
    timestamp: Date;
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

export class SecurityScoring {
    private readonly config: SecurityModelConfig;
    private lastAnalyzedProgramId: string | null = null;
    private connection: any; // Needs a proper connection object

    constructor(config: Partial<SecurityModelConfig> = {}, connection: any) { // Added connection parameter
        this.config = {
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

    public async analyzeProgram(programId: string): Promise<AnalysisResult> {
        this.lastAnalyzedProgramId = programId;
        const metrics = await this.analyzeSecurityMetrics(programId);
        const score = this.calculateScore(metrics);
        const validation = await this.validateProgram(programId);
        const risks = await this.detectRiskPatterns(metrics);
        const analysis = await this.analyzeSecurity(metrics);

        return {
            score,
            riskLevel: analysis.riskLevel,
            patterns: risks,
            suggestions: [...this.generateSuggestions(score, validation), ...risks],
            validation,
            timestamp: new Date(),
            programId
        };
    }

    public async analyzeSecurity(program: PublicKey): Promise<AnalysisResult> {
        const metrics = await this.analyzeSecurityMetrics(program.toBase58());
        const score = this.calculateScore(metrics);
        const validation = await this.validateProgram(program.toBase58());
        const risks = await this.detectRiskPatterns(metrics);
        const analysis: SecurityAnalysis = {
            patterns: await this.detectPatterns(metrics),
            riskLevel: this.determineRiskLevel(await this.detectPatterns(metrics)),
            timestamp: new Date(),
            programId: program.toBase58()
        };

        return {
            score,
            riskLevel: analysis.riskLevel,
            patterns: risks,
            suggestions: [...this.generateSuggestions(score, validation), ...risks],
            validation,
            timestamp: new Date()
        };
    }

    public async detectPatterns(program: PublicKey): Promise<{ patterns: SecurityPattern[]; timestamp: Date }> {
        const metrics = await this.analyzeSecurityMetrics(program.toBase58());
        const patterns = await this.detectSecurityPatterns(metrics);
        return {
            patterns,
            timestamp: new Date()
        };
    }

    private async detectSecurityPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
        const patterns: SecurityPattern[] = [];
        const timestamp = Date.now();

        if (metrics.access.score < this.config.thresholds.medium) {
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

        if (metrics.arithmetic?.score < this.config.thresholds.medium) {
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

        if (metrics.input?.score < this.config.thresholds.medium) {
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
        if (patterns.some(p => p.severity === 'CRITICAL')) return 'CRITICAL';
        if (patterns.some(p => p.severity === 'HIGH')) return 'HIGH';
        if (patterns.some(p => p.severity === 'MEDIUM')) return 'MEDIUM';
        return 'LOW';
    }

    private async collectMetrics(programId: string): Promise<SecurityMetric[]> {
        // Mock implementation for testing
        return [
            {
                name: 'ownership',
                score: 0.8,
                weight: this.config.weightings.ownership,
                details: ['Proper ownership checks implemented'],
                risk: 'LOW'
            },
            {
                name: 'access',
                score: 0.9,
                weight: this.config.weightings.access,
                details: ['Access control properly implemented'],
                risk: 'LOW'
            },
            {
                name: 'arithmetic',
                score: 0.85,
                weight: this.config.weightings.arithmetic!,
                details: ['Safe arithmetic operations verified'],
                risk: 'LOW'
            },
            {
                name: 'input',
                score: 0.75,
                weight: this.config.weightings.input!,
                details: ['Input validation checks present'],
                risk: 'MEDIUM'
            },
            {
                name: 'state',
                score: 0.95,
                weight: this.config.weightings.state!,
                details: ['State management properly handled'],
                risk: 'LOW'
            }
        ];
    }

    private calculateScore(metrics: SecurityMetrics): SecurityScore {
        const metricList = Object.values(metrics);
        const overallScore = metricList.reduce(
            (acc, metric) => acc + metric.score * metric.weight,
            0
        );

        return {
            overallScore,
            metrics: metricList,
            timestamp: Date.now(),
            programId: this.lastAnalyzedProgramId!,
            risk: this.determineRiskLevel(this.detectSecurityPatterns(metrics))
        };
    }

    private async analyzeSecurityMetrics(programId: string): Promise<SecurityMetrics> {
        this.lastAnalyzedProgramId = programId;
        const metrics = await this.collectMetrics(programId);
        return {
            ownership: metrics.find(m => m.name === 'ownership')!,
            access: metrics.find(m => m.name === 'access')!,
            arithmetic: metrics.find(m => m.name === 'arithmetic'),
            input: metrics.find(m => m.name === 'input'),
            state: metrics.find(m => m.name === 'state')
        };
    }

    private async detectRiskPatterns(metrics: SecurityMetrics): Promise<string[]> {
        const risks: string[] = [];

        if (metrics.access.score < this.config.thresholds.high) {
            risks.push('Critical access control vulnerabilities detected');
        }

        if (metrics.arithmetic?.score < this.config.thresholds.medium) {
            risks.push('Potential arithmetic overflow risks identified');
        }

        if (metrics.input?.score < this.config.thresholds.medium) {
            risks.push('Input validation improvements recommended');
        }

        return risks;
    }

    private async validateProgram(programId: string): Promise<ValidationResult> {
        // Mock implementation for testing.  Needs a real connection object.
        const valid = true;
        const errors: string[] = [];
        const warnings: string[] = ['Consider implementing additional access controls'];
        return { valid, errors, warnings };
    }

    private generateSuggestions(score: SecurityScore, validation: ValidationResult): string[] {
        const suggestions: string[] = [];

        if (score.overallScore < this.config.thresholds.high) {
            suggestions.push('Critical: Immediate security improvements required');
        } else if (score.overallScore < this.config.thresholds.medium) {
            suggestions.push('Warning: Security improvements recommended');
        }

        return [...suggestions, ...validation.warnings];
    }
}
