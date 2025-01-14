export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY'
}

export enum VulnerabilityType {
    ArithmeticOverflow = 'ArithmeticOverflow',
    AccessControl = 'AccessControl',
    None = 'None',
    Reentrancy = 'Reentrancy',
    PDASafety = 'PDASafety',
    AccountDataValidation = 'AccountDataValidation'
}

export interface GovernanceConfig {
    minStakeAmount: number;
    minStakeLockupPeriod: number;
    maxStakeLockupPeriod: number;
}

export interface ChaosRequestParams {
    targetProgram: string;
    testType: TestType;
    duration: number;
    intensity: number;
    resultRef?: string;
}

export interface ChaosResult {
    requestId: string;
    status: 'completed' | 'failed';
    resultRef?: string;
    logs?: string[];
    metrics?: {
        totalTransactions: number;
        errorRate: number;
        avgLatency: number;
    };
}

export interface ProposalParams {
    title: string;
    description: string;
    targetProgram: string;
    testParams: ChaosRequestParams;
    stakingAmount: number;
}

export interface ErrorDetails {
    timestamp: number;
    [key: string]: any;
}
