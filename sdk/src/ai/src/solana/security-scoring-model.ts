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
    };
}

export interface SecurityScore {
    score: number;
    weight: number;
    risk: RiskLevel;
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
    isValid: boolean;
    issues: string[];
}

export interface AnalysisResult {
    score: number;
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
        access: 0.4
    }
};

export class SecurityScoring {
    private readonly config: SecurityModelConfig;
    private lastAnalyzedProgramId: string | null = null;

    constructor(config: Partial<SecurityModelConfig> = {}) {
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
    }
    public async analyzeProgram(programId: string): Promise<AnalysisResult> {
        this.lastAnalyzedProgramId = programId;
        const metrics = await this.analyzeSecurityMetrics(programId);
        const validation = await this.validateProgram(programId);
        const patterns = await this.detectSecurityPatterns(metrics);
        const score = this.calculateScore(metrics);
        const riskLevel = this.determineRiskLevel(patterns);

        return {
            score,
            patterns,
            riskLevel,
            suggestions: this.generateSuggestions(score, validation),
            validation,
            timestamp: new Date()
        };
    }
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
                type: 'ACCESS_CONTROL',
                severity: 'HIGH',
                description: 'Insufficient access controls detected',
                confidence: 0.8,
                indicators: metrics.access.details,
                timestamp
            });
        }

        if (metrics.arithmetic?.score < this.config.thresholds.medium) {
            patterns.push({
                type: 'ARITHMETIC',
                severity: 'MEDIUM', 
                description: 'Arithmetic operation risks identified',
                confidence: 0.85,
                indicators: metrics.arithmetic.details,
                timestamp
            });
        }

        if (metrics.input?.score < this.config.thresholds.medium) {
            patterns.push({
                type: 'INPUT_VALIDATION',
                severity: 'MEDIUM',
                description: 'Input validation improvements needed',
                confidence: 0.75,
                indicators: metrics.input.details,
                timestamp
            });
        }

        return patterns;
    }

        return patterns;
    }

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
            }
        ];
    }

    private calculateScore(metrics: SecurityMetrics): number {
        let totalScore = 0;
        let totalWeight = 0;
        
        if (metrics.ownership) {
            totalScore += metrics.ownership.score * metrics.ownership.weight;
            totalWeight += metrics.ownership.weight;
        }
        
        if (metrics.access) {
            totalScore += metrics.access.score * metrics.access.weight;  
            totalWeight += metrics.access.weight;
        }

        if (metrics.arithmetic) {
            totalScore += metrics.arithmetic.score * (metrics.arithmetic.weight || 0.5);
            totalWeight += metrics.arithmetic.weight || 0.5;
        }

        if (metrics.input) {
            totalScore += metrics.input.score * (metrics.input.weight || 0.3);
            totalWeight += metrics.input.weight || 0.3;  
        }

        if (metrics.state) {
            totalScore += metrics.state.score * (metrics.state.weight || 0.4);
            totalWeight += metrics.state.weight || 0.4;
        }

        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    private async analyzeSecurityMetrics(programId: string): Promise<SecurityMetrics> {
        return {
            access: {
                score: 0.8,
                weight: this.config.weightings.access,
                details: ['Access control properly implemented'],
                risk: 'LOW'
            },
            ownership: {
                score: 0.9,
                weight: this.config.weightings.ownership,
                details: ['Proper ownership checks implemented'],
                risk: 'LOW'
            }
        };
    }

    private async detectRiskPatterns(metrics: SecurityMetrics): Promise<string[]> {
        const risks: string[] = [];

        if (metrics.access.score < this.config.thresholds.high) {
            risks.push('Critical access control vulnerabilities detected');
        }

        if (metrics.arithmetic.score < this.config.thresholds.medium) {
            risks.push('Potential arithmetic overflow risks identified');
        }

        if (metrics.input.score < this.config.thresholds.medium) {
            risks.push('Input validation improvements recommended');
        }

        return risks;
    }

    private async validateProgram(programId: string): Promise<ValidationResult> {
        const issues: string[] = [];
        let isValid = true;

        try {
            // Verify program exists
            const programInfo = await this.connection.getAccountInfo(new PublicKey(programId));
            if (!programInfo) {
                issues.push('Program account not found');
                isValid = false;
            } else {
                // Check if it's an executable account
                if (!programInfo.executable) {
                    issues.push('Account is not an executable program');
                    isValid = false;
                }

                // Check minimum balance requirement
                if (programInfo.lamports < 100000) {
                    issues.push('Program account has insufficient balance');
                    isValid = false;
                }
            }

            // Additional validation checks
            const metrics = await this.analyzeSecurityMetrics(programId);
            if (metrics.access.score < this.config.thresholds.high) {
                issues.push('Access control implementation needs review');
            }
            if (metrics.ownership.score < this.config.thresholds.high) {
                issues.push('Ownership controls need improvement');
            }

        } catch (error) {
            issues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            isValid = false;
        }

        return {
            isValid,
            issues
        };
    }

    private generateSuggestions(score: number, validation: ValidationResult): string[] {
        const suggestions: string[] = [];

        if (!validation.isValid) {
            suggestions.push('Fix validation issues before deployment');
        }
        if (score < this.config.thresholds.medium) {
            public async analyzeProgram(programId: string): Promise<AnalysisResult> {
            const metrics = await this.analyzeSecurityMetrics(programId);
            const score = this.calculateScore(metrics);
            const validation = await this.validateProgram(programId);
            const patterns = await this.detectSecurityPatterns(metrics);
            const riskLevel = this.determineRiskLevel(patterns);

            return {
                score,
                riskLevel,
                patterns,
                suggestions: this.generateSuggestions(score, validation),
                validation,
                timestamp: new Date()
            };
            }
        return suggestions;
    }


{
    const metrics = await this.analyzeSecurityMetrics(programId);
    const score = this.calculateScore(metrics);
    const validation = await this.validateProgram(programId);
    const risks = await this.detectRiskPatterns(metrics);
    const analysis = await this.analyzeSecurity(metrics);

    return {
        securityScore: score,
        validation,
        suggestions: [...this.generateSuggestions(score, validation), ...risks],
        analysis
    };
}


{
    const metrics = await this.analyzeSecurityMetrics(program.toBase58());
    const score = this.calculateScore(metrics);
    const validation = await this.validateProgram(program.toBase58());
    const risks = await this.detectRiskPatterns(metrics);
    const analysis = await this.analyzeSecurity(metrics);

    return {
        score: {
            overallScore: score.overallScore * 100,
            timestamp: new Date(),
            programId: program.toBase58(),
        },
        riskLevel: analysis.riskLevel,
        patterns: risks,
    };
}

private async detectSecurityPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
    const patterns: SecurityPattern[] = [];
    const timestamp = Date.now();

    if (metrics.access.score < this.config.thresholds.medium) {
        patterns.push({
            type: 'ACCESS_CONTROL',
            severity: 'HIGH',
            description: 'Insufficient access controls detected',
            timestamp
        });
    }

    return patterns;
}

if (metrics.access.score < this.config.thresholds.medium) {
    patterns.push({
    type: 'ACCESS_CONTROL',
    severity: 'HIGH',
    description: 'Insufficient access controls detected',
    timestamp
    });
}

return patterns;
}
    securityScore: score,
    validation,
    suggestions: [...this.generateSuggestions(score, validation), ...risks],
    analysis
    };
}

{
    const metrics = await this.analyzeSecurityMetrics(program.toBase58());
    const patterns = await this.detectSecurityPatterns(metrics);
    return {
        patterns,
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
    score: {
        overallScore: score.overallScore * 100,
        timestamp: new Date(),
        programId: program.toBase58(),
    },
    riskLevel: analysis.riskLevel,
    patterns: risks,
    };
}

{
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

    if (metrics.arithmetic.score < this.config.thresholds.medium) {
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

    return patterns;
}

private async analyzeSecurity(metrics: SecurityMetrics): Promise<SecurityAnalysis>
    patterns,
    timestamp: new Date()
    };
}

{
    const patterns = await this.detectSecurityPatterns(metrics);
    const riskLevel = this.determineRiskLevel(patterns);

    return {
        patterns,
        riskLevel,
        timestamp: new Date(),
        programId: this.lastAnalyzedProgramId!,
    };
}

private determineRiskLevel(patterns: SecurityPattern[]): RiskLevel {
    const hasCritical = patterns.some(p => p.severity === 'CRITICAL');
    if (hasCritical) return 'CRITICAL';
    
    const hasHigh = patterns.some(p => p.severity === 'HIGH');
    if (hasHigh) return 'HIGH';
    
    const hasMedium = patterns.some(p => p.severity === 'MEDIUM');
    if (hasMedium) return 'MEDIUM';
    
    return 'LOW';
}

    if (metrics.arithmetic.score < this.config.thresholds.medium) {
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

    return patterns;
}

private async analyzeSecurity(metrics: SecurityMetrics): Promise<SecurityAnalysis> {
    const patterns = await this.detectPatterns(metrics);
    const riskLevel = this.determineRiskLevel(patterns);

    return {
    patterns,
    riskLevel,
    timestamp: new Date(),
    programId: this.lastAnalyzedProgramId!,
    };
}

{
    if (patterns.some(p => p.severity === 'CRITICAL')) return 'CRITICAL';
    if (patterns.some(p => p.severity === 'HIGH')) return 'HIGH';
    if (patterns.some(p => p.severity === 'MEDIUM')) return 'MEDIUM';
    return 'LOW';
}

private async collectMetrics(programId: string): Promise<SecurityMetric[]>
    if (patterns.some(p => p.severity === 'CRITICAL')) return 'CRITICAL';
    if (patterns.some(p => p.severity === 'HIGH')) return 'HIGH';
    if (patterns.some(p => p.severity === 'MEDIUM')) return 'MEDIUM';
    return 'LOW';
}

{
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
        }
    ];
}

private calculateScore(metrics: SecurityMetrics): SecurityScore
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
    }
    ];
}

{
    const metricList = Object.values(metrics);
    const overallScore = metricList.reduce(
        (acc, metric) => acc + metric.score * metric.weight,
        0
    );

    return {
        overallScore,
        metrics: metricList,
        timestamp: Date.now(),
        programId: this.lastAnalyzedProgramId!
    };
}

private async analyzeSecurityMetrics(programId: string): Promise<SecurityMetrics>
    (acc, metric) => acc + metric.score * metric.weight,
    0
    );

    return {
    overallScore,
    metrics: metricList,
    timestamp: Date.now(),
    programId: this.lastAnalyzedProgramId!
    };
}

{
    this.lastAnalyzedProgramId = programId;
    return {
        ownership: {
            name: 'ownership',
            score: 0.8,
            weight: this.config.weightings.ownership,
            details: ['Proper ownership checks implemented'],
            risk: 'LOW'
        },
        access: {
            name: 'access',
    
    ownership: {
        name: 'ownership',
        score: 0.8,
        weight: this.config.weightings.ownership,
        details: ['Proper ownership checks implemented'],
        risk: 'LOW'
    },
    access: {
        name: 'access',
        score: 0.9,
        weight: this.config.weightings.access,
        details: ['Access control properly implemented'],
        risk: 'LOW'
    },
    arithmetic: {
        name: 'arithmetic',
        score: 0.85,
        weight: this.config.weightings.arithmetic,
        details: ['Safe arithmetic operations verified'],
        risk: 'LOW'
    },
    input: {
        name: 'input',
        score: 0.75,
        weight: this.config.weightings.input,
        details: ['Input validation checks present'],
        risk: 'MEDIUM'
    },
    state: {
        name: 'state',
        score: 0.95,
        weight: this.config.weightings.state,
        details: ['State management properly handled'],
        risk: 'LOW'
    }
    };
}

private async detectRiskPatterns(metrics: SecurityMetrics): Promise<string[]> {
    const risks: string[] = [];

    if (metrics.access.score < this.config.thresholds.high) {
    risks.push('Critical access control vulnerabilities detected');
    }

    if (metrics.arithmetic.score < this.config.thresholds.medium) {
    risks.push('Potential arithmetic overflow risks identified');
    }

    if (metrics.input.score < this.config.thresholds.medium) {
    risks.push('Input validation improvements recommended');
    }

    return risks;
}

private async validateProgram(programId: string): Promise<ValidationResult> {
    // Mock implementation for testing
    return {
    valid: true,
    errors: [],
    warnings: ['Consider implementing additional access controls']
    };
}

private generateSuggestions(
    score: SecurityScore,
    validation: ValidationResult
): string[] {
    const suggestions: string[] = [];
    
    if (score.overallScore < this.config.thresholds.high) {
    suggestions.push('Critical: Immediate security improvements required');
    } else if (score.overallScore < this.config.thresholds.medium) {
    suggestions.push('Warning: Security improvements recommended');
    }

    return [...suggestions, ...validation.warnings];
}
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
    score: {
    overallScore: score.overallScore * 100,
    timestamp: new Date(),
    programId: program.toBase58(),
    },
    riskLevel: analysis.riskLevel,
    patterns: risks,
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

if (metrics.arithmetic.score < this.config.thresholds.medium) {
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

return patterns;
}

private async detectPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
}

private async detectPatterns(metrics: SecurityMetrics): Promise<SecurityPattern[]> {
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

if (metrics.arithmetic.score < this.config.thresholds.medium) {
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
    }
];
}
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
    programId: this.lastAnalyzedProgramId!
};
}

private lastAnalyzedProgramId: string | null = null;

private async analyzeSecurityMetrics(programId: string): Promise<SecurityMetrics> {
this.lastAnalyzedProgramId = programId;
return {
    ownership: {
    name: 'ownership',
    score: 0.8,
    weight: this.config.weightings.ownership,
    details: ['Proper ownership checks implemented'],
    risk: 'LOW'
    },
    access: {
    name: 'access',
    score: 0.9,
    weight: this.config.weightings.access,
    details: ['Access control properly implemented'],
    risk: 'LOW'
    },
    arithmetic: {
    name: 'arithmetic',
    score: 0.85,
    weight: this.config.weightings.arithmetic,
    details: ['Safe arithmetic operations verified'],
    risk: 'LOW'
    },
    input: {
    name: 'input',
    score: 0.75,
    weight: this.config.weightings.input,
    details: ['Input validation checks present'],
    risk: 'MEDIUM'
    },
    state: {
    name: 'state',
    score: 0.95,
    weight: this.config.weightings.state,
    details: ['State management properly handled'],
    risk: 'LOW'
    }
};
}

private async detectRiskPatterns(metrics: SecurityMetrics): Promise<string[]> {
const risks: string[] = [];

if (metrics.access.score < this.config.thresholds.high) {
    risks.push('Critical access control vulnerabilities detected');
}

if (metrics.arithmetic.score < this.config.thresholds.medium) {
    risks.push('Potential arithmetic overflow risks identified');
}

if (metrics.input.score < this.config.thresholds.medium) {
    risks.push('Input validation improvements recommended');
}

return risks;
}
}

private async validateProgram(programId: string): Promise<ValidationResult> {
    // Mock implementation for testing
    return {
    valid: true,
    errors: [],
    warnings: ['Consider implementing additional access controls']
    };
}

private generateSuggestions(
    score: SecurityScore,
    validation: ValidationResult
): string[] {
    const suggestions: string[] = [];
    
    if (score.overallScore < this.config.thresholds.high) {
    suggestions.push('Critical: Immediate security improvements required');
    } else if (score.overallScore < this.config.thresholds.medium) {
    suggestions.push('Warning: Security improvements recommended');
    }

    return [...suggestions, ...validation.warnings];
}
}

