import { PublicKey } from '@solana/web3.js';

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
    Cancelled = 'cancelled',
    Queued = 'queued',
    Expired = 'expired'
}

export interface VoteWeight {
    yes: number;
    no: number;
    abstain: number;
}

export interface ProposalVote {
    voter: PublicKey;
    vote: boolean;
    weight: number;
    timestamp: number;
}

export interface ProposalMetadata {
    title: string;
    description: string;
    proposer: PublicKey;
    startTime: number;
    endTime: number;
    executionTime: number;
    voteWeights: VoteWeight;
    votes: ProposalVote[];
    quorum: number;
    executed: boolean;
}

export interface ProposalMetadata {
    title: string;
    description: string;
    proposer: PublicKey;
    startTime: number;
    endTime: number;
    executionTime: number;
    voteWeights: VoteWeight;
    votes: ProposalVote[];
    quorum: number;
    executed: boolean;
}

export interface ProposalParams {
    title: string;
    description: string;
    targetProgram: string | PublicKey;
    testParams: ChaosRequestParams;
    stakingAmount: number;
}

export interface StakeInfo {
    amount: bigint;
    lockupPeriod: bigint;
    startTime: bigint;
    owner: PublicKey;
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
