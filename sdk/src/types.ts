import { PublicKey } from '@solana/web3.js';

export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY'
}

export interface ChaosRequestParams {
    targetProgram: string | PublicKey;
    testType: TestType;
    duration: number;
    intensity: number;
    params?: Record<string, any>;
}

export interface ChaosResult {
    requestId: string;
    status: 'completed' | 'failed';
    resultRef: string;
    logs: string[];
    metrics?: {
        totalTransactions: number;
        errorRate: number;
        avgLatency: number;
    };
}
