import { PublicKey, Connection } from '@solana/web3.js';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SecurityMetric {
    name: string;
    score: number;
    weight: number;
    details?: string[];
    risk: RiskLevel;
    location?: string;
    timestamp?: number;
}

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
    programId: string;
    score: SecurityScore;
    riskLevel: RiskLevel;
    patterns: SecurityPattern[];
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
    private connection: Connection;
    private overallScore: number = 0;

    constructor(config: Partial<SecurityModelConfig> = {}, connection: Connection) {
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

    public async analyzeProgram(programId: PublicKey | string): Promise<AnalysisResult> {
        const programIdStr = typeof programId === 'string' ? programId : programId.toBase58();
        this.lastAnalyzedProgramId = programIdStr;
        const metrics = await this.analyzeSecurityMetrics(programIdStr);
        const score = this.calculateScore(metrics);
        const validation = await this.validateProgram(programIdStr);
        const risks = await this.detectRiskPatterns(metrics);
        const analysis = await this.analyzeSecurity(programIdStr);

        return {
            score,
            riskLevel: analysis.riskLevel,
            patterns: risks,
            suggestions: this.generateSuggestions(score, validation),
            validation,
            timestamp: new Date(),
            programId: programIdStr
        };
    }

    public async analyzeSecurity(program: PublicKey | string): Promise<AnalysisResult> {
        const programId = typeof program === 'string' ? program : program.toBase58();
        const metrics = await this.analyzeSecurityMetrics(programId);
        const score = this.calculateScore(metrics);
        const validation = await this.validateProgram(programId);
        const risks = await this.detectRiskPatterns(metrics);
        const analysis: SecurityAnalysis = {
            patterns: await this.detectPatterns(programId),
            riskLevel: this.determineRiskLevel(await this.detectPatterns(programId)),
            timestamp: new Date(),
            programId
        };

        return {
            score,
            riskLevel: analysis.riskLevel,
            patterns: risks,
            suggestions: this.generateSuggestions(score, validation),
            validation,
            timestamp: new Date(),
            programId
        };
    }

    /**
    * Analyzes security patterns in a program
    * @param program The program public key to analyze
    * @returns Detected security patterns and timestamp
    */
    public async detectPatterns(program: PublicKey | string): Promise<SecurityAnalysis> {
        const programId = typeof program === 'string' ? program : program.toBase58();
        const metrics = await this.analyzeSecurityMetrics(programId);
        const patterns = await this.detectSecurityPatterns(metrics);
        return {
            patterns,
            riskLevel: this.determineRiskLevel(patterns),
            timestamp: new Date(),
            programId
        };
    }

    /**
    * Identifies potential vulnerabilities in a program
    * @param program The program to analyze
    * @returns Analysis result with vulnerabilities and suggestions
    */
    public async identifyVulnerabilities(program: PublicKey | string): Promise<AnalysisResult> {
        const programId = typeof program === 'string' ? program : program.toBase58();
        const metrics = await this.analyzeSecurityMetrics(programId);
        const score = this.calculateScore(metrics);
        const validation = await this.validateProgram(programId);
        const patterns = await this.detectRiskPatterns(metrics);

        return {
            score,
            riskLevel: score.risk,
            patterns,
            suggestions: this.generateSuggestions(score, validation),
            validation,
            timestamp: new Date(),
            programId
        };
    }

    private async detectSecurityPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
        if (!metrics) {
            return [];
        }
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
        const patternArray = Array.isArray(patterns) ? patterns : [];
        const hasCritical = patternArray.some(p => p?.severity === 'CRITICAL');
        const hasHigh = patternArray.some(p => p?.severity === 'HIGH');
        const hasMedium = patternArray.some(p => p?.severity === 'MEDIUM');
        
        if (hasCritical) return 'CRITICAL';
        if (hasHigh) return 'HIGH';
        if (hasMedium) return 'MEDIUM';
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
        const totalWeight = metricList.reduce((acc, metric) => acc + metric.weight, 0);
        const weightedScore = metricList.reduce(
            (acc, metric) => acc + metric.score * metric.weight,
            0
        ) / totalWeight;
        
        const details = metricList.flatMap(metric => metric.details || []);
        const risk = this.determineRiskLevel(this.detectSecurityPatterns(metrics));
        
        return {
            score: weightedScore,
            weight: totalWeight,
            risk,
            details,
            location: metricList[0]?.location
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

        if (score.score < this.config.thresholds.high) {
            suggestions.push('Critical: Immediate security improvements required');
        } else if (score.score < this.config.thresholds.medium) {
            suggestions.push('Warning: Security improvements recommended');
        }

        return [...suggestions, ...validation.warnings];
    }
}
