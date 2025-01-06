import { PublicKey } from '@solana/web3.js';

export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY'
}

export interface FuzzTestParams {
    instructionTypes?: string[];
    seedRange?: [number, number];
    maxAccountSize?: number;
}

export interface LoadTestParams {
    tps: number;
    rampUp?: boolean;
    concurrentUsers?: number;
}

export interface ExploitTestParams {
    categories: ('reentrancy' | 'arithmetic' | 'access-control')[];
    maxDepth?: number;
}

export interface ChaosRequestParams {
    targetProgram: string | PublicKey;
    testType: TestType;
    duration: number;
    intensity: number;
    params?: {
        fuzz?: FuzzTestParams;
        load?: LoadTestParams;
        exploit?: ExploitTestParams;
    };
}

export interface StakeInfo {
    amount: number;
    lockupPeriod: number;
    startTime: number;
    owner: PublicKey;
}

export interface GovernanceConfig {
    minVotingPeriod: number;
    maxVotingPeriod: number;
    minStakeAmount?: number;
    votingPeriod?: number;
    quorum?: number;
    executionDelay?: number;
    minStakeLockupPeriod?: number;  // Minimum time tokens must be staked
    maxStakeLockupPeriod?: number;  // Maximum allowed lockup period
}

export enum ProposalState {
    Draft = 'draft',
    Active = 'active',
    Succeeded = 'succeeded',
    Defeated = 'defeated',
    Executed = 'executed',
    Cancelled = 'cancelled'
}

export interface ProposalParams {
    title: string;
    description: string;
    targetProgram: string | PublicKey;
    testParams: ChaosRequestParams;
    stakingAmount: number;
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
