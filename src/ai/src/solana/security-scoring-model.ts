import { Connection, PublicKey } from '@solana/web3.js';

export interface SecurityModelConfig {
    thresholds: {
        high: number;
        medium: number;
        low: number;
    };
    weightings: {
        ownership: number;
        access: number;
    };
}

export interface SecurityMetrics {
    access: {
        score: number;
    };
}

export interface SecurityPattern {
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    timestamp: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SecurityScore {
    score: number;
    weight: number;
    details: string[];
    risk: RiskLevel;
}

export interface SecurityAnalysis {
    score: SecurityScore;
    patterns: SecurityPattern[];
    timestamp: Date;
}

export interface AnalysisResult {
    analysis: SecurityAnalysis;
    validation: ValidationResult;
    suggestions: string[];
}

export class SecurityScoringModel {
    private config: SecurityModelConfig;
    private connection: Connection;
    private metrics: SecurityMetrics | null = null;
    private lastAnalyzedProgramId: string | null = null;

    constructor(
        connection: Connection,
        config: Partial<SecurityModelConfig> = {}
    ) {
        this.connection = connection;
        this.config = {
            thresholds: {
                high: 0.8,
                medium: 0.6,
                low: 0.4,
                ...config.thresholds
            },
            weightings: {
                ownership: 0.6,
                access: 0.4,
                ...config.weightings
            }
        };
    }

    public async analyzeProgram(programId: string): Promise<AnalysisResult> {
        const metrics = await this.analyzeSecurityMetrics(programId);
        const score = this.calculateScore(metrics);
        const validation = await this.validateProgram(programId);
        const risks = await this.detectRiskPatterns(metrics);
        const patterns = await this.detectSecurityPatterns(metrics);
        
        return {
            analysis: {
                score: score,
                patterns: patterns,
                timestamp: new Date()
            },
            validation: validation,
            suggestions: this.generateSuggestions(score, validation)
        };
    }

    private async detectSecurityPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
        const patterns: SecurityPattern[] = [];
        const timestamp = Date.now();

        if (metrics.access.score < this.config.thresholds.medium) {
            patterns.push({
                type: 'ACCESS_CONTROL',
                severity: 'HIGH' as const,
                description: 'Insufficient access controls detected',
                timestamp: timestamp
            });
        }

        return patterns;
    }

    private calculateScore(metrics: SecurityMetrics): SecurityScore {
        const score = metrics.access.score;
        let risk: RiskLevel = 'HIGH';
        
        if (score >= this.config.thresholds.high) {
            risk = 'LOW';
        } else if (score >= this.config.thresholds.medium) {
            risk = 'MEDIUM';
        }

        return {
            score: score,
            weight: this.config.weightings.access,
            details: ['Access control implementation analysis'],
            risk: risk
        };
    }

    private async validateProgram(programId: string): Promise<ValidationResult> {
        try {
            const programInfo = await this.connection.getAccountInfo(new PublicKey(programId));
            return {
                isValid: !!programInfo,
                errors: programInfo ? [] : ['Program account not found']
            };
        } catch (error) {
            return {
                isValid: false,
                errors: ['Failed to validate program']
            };
        }
    }

    private generateSuggestions(score: SecurityScore, validation: ValidationResult): string[] {
        const suggestions: string[] = [];

        if (score.score < this.config.thresholds.high) {
            suggestions.push('Implement stronger access controls');
        }

        if (!validation.isValid && validation.errors.length > 0) {
            suggestions.push(...validation.errors.map(err => `Fix validation error: ${err}`));
        }

        return suggestions;
    }

    private async analyzeSecurityMetrics(programId: string): Promise<SecurityMetrics> {
        this.lastAnalyzedProgramId = programId;
        
        return {
            access: {
                score: 0.75
            }
        };
    }

    private async detectRiskPatterns(metrics: SecurityMetrics): Promise<string[]> {
        const risks: string[] = [];

        if (metrics.access.score < this.config.thresholds.high) {
            risks.push('Access control vulnerabilities detected');
        }

        return risks;
    }
}
