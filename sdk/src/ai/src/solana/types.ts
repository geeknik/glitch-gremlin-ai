export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityMetrics {
ownership: SecurityMetric;
access: SecurityMetric;
arithmetic: SecurityMetric;
input: SecurityMetric;
state: SecurityMetric;
}

export interface SecurityMetric {
name: string;
score: number;
weight: number;
details: string[];
risk: RiskLevel;
timestamp?: number;
location?: string;
impact?: string;
patterns?: SecurityPattern[];
}

export interface SecurityPattern {
    type: string;
    confidence: number;
    severity: RiskLevel;
    description: string;
    indicators: string[];
    timestamp: number;
    location?: string;
    risk?: RiskLevel;
    details?: string[];
}

export interface SecurityScore {
overallScore: number;
metrics: SecurityMetric[];
timestamp: number;
programId: string;
}

export interface ValidationResult {
valid: boolean;
errors: string[];
warnings: string[];
}

export interface SecurityAnalysis {
patterns: SecurityPattern[];
riskLevel: RiskLevel;
timestamp: number;
programId: string;
}

export interface AnalysisResult {
securityScore: SecurityScore;
validation: ValidationResult;
suggestions: string[];
analysis: SecurityAnalysis;
}

export interface SecurityModelConfig {
weightings: {
    [key: string]: number;
};
thresholds: {
    low: number;
    medium: number;
    high: number;
};
}

