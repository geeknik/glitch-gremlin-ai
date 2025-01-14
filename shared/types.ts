export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY'
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
