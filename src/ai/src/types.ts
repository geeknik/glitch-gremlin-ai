import type { PublicKey } from '@solana/web3.js';

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

