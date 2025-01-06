export enum VulnerabilityType {
    Reentrancy = 'reentrancy',
    ArithmeticOverflow = 'arithmetic-overflow',
    AccessControl = 'access-control',
    RaceCondition = 'race-condition',
    InstructionInjection = 'instruction-injection',
    AccountConfusion = 'account-confusion',
    SignerAuthorization = 'signer-authorization',
    PdaValidation = 'pda-validation',
    ClockManipulation = 'clock-manipulation',
    LamportDrain = 'lamport-drain'
}

export enum RiskLevel {
    Critical = 'critical',
    High = 'high',
    Medium = 'medium',
    Low = 'low',
    Info = 'info'
}

export interface Finding {
    type: VulnerabilityType;
    severity: RiskLevel;
    confidence: number;
    details: string;
    recommendation?: string;
}

export interface ScanResult {
    findings: Finding[];
    riskScore: number;
    riskLevel: RiskLevel;
    recommendations: string[];
    metrics: {
        totalTransactions: number;
        errorRate: number;
        avgLatency: number;
    };
}
