import { PublicKey } from '@solana/web3.js';
import type { RedisConfig } from './redis.js';

export * from './redis.js';
export * from './config.js';

export interface ChaosRequestParams {
    targetProgram: string;
    chaosType: string;
    intensity?: number;
    securityLevel?: number;
    executionEnvironment?: 'sgx' | 'kvm' | 'wasm';
    maxDuration?: number;
    stakingAmount?: number;
}

export interface ErrorDetails {
    code: number;
    message: string;
    metadata?: Record<string, any>;
}

export interface ChaosRequest {
    id: string;
    params: ChaosRequestParams;
    status: 'pending' | 'running' | 'completed' | 'failed';
    createdAt: number;
    updatedAt: number;
}

export enum ProposalState {
    Draft = 'Draft',
    Active = 'Active',
    Succeeded = 'Succeeded',
    Failed = 'Failed',
    Executed = 'Executed',
    Cancelled = 'Cancelled'
}

export interface ProposalData {
    title: string;
    description: string;
    proposer: PublicKey;
    startTime: number;
    endTime: number;
    executionTime: number;
    voteWeights: {
        yes: number;
        no: number;
        abstain: number;
    };
    votes: PublicKey[];
    quorum: number;
    executed: boolean;
    state: ProposalState;
}

export interface VoteRecord {
    proposal: PublicKey;
    voter: PublicKey;
    vote: 'yes' | 'no' | 'abstain';
    weight: number;
    timestamp: number;
}

export interface DelegationRecord {
    delegator: PublicKey;
    delegate: PublicKey;
    amount: number;
    timestamp: number;
    expiry?: number;
}

export interface SDKConfig {
    connection: {
        endpoint: string;
        commitment?: string;
    };
    programId: PublicKey;
    redis?: RedisConfig;
    heliusApiKey?: string;
} 
