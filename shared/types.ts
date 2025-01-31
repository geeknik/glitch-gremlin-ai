export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY',
    MUTATION = 'MUTATION',
    NETWORK = 'NETWORK'
}

export enum SecurityLevel {
    CRITICAL = 0,
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3
}

export interface ChaosTestConfig {
    testType: TestType;
    securityLevel: SecurityLevel;
    executionEnv: 'sgx' | 'kvm' | 'wasm';
    proofRequired: boolean;
}

export interface SecurityMetric {
    score: number;
    weight: number;
    risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    details?: string[];
    location?: string;
    timestamp?: number;
}

export interface SecurityPattern {
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    timestamp: number;
    confidence?: number;
    indicators?: string[];
    location?: string;
}
