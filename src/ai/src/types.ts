import type { PublicKey } from '@solana/web3.js';

export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY'
}

export interface TimeSeriesMetric {
    instructionFrequency: number;
    memoryAccess: number;
    accountAccess: number;
    stateChanges: number;
    pdaValidation: number;
    accountDataMatching: number;
    cpiSafety: number;
    authorityChecks: number;
    timestamp: number;
}

export interface AnomalyDetail {
    type: string;
    score: number;
    confidence?: number;
    correlatedPatterns?: string[];
}

export interface AnomalyDetectionResult {
    isAnomaly: boolean;
    confidence: number;
    details: AnomalyDetail[];
}

export interface SecurityMetrics {
    arithmetic?: {
        score: number;
        details: string[];
        location?: string;
    };
    input?: {
        score: number;
        details: string[];
        location?: string;
    };
}

export interface SecurityPattern {
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    details: string[];
}

export interface SecurityScore {
    score: number;
    weight: number;
    risk: 'HIGH' | 'MEDIUM' | 'LOW';
    details?: string[];
    location?: string;
}

