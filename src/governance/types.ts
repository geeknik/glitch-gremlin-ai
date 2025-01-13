import { PublicKey } from '@solana/web3.js';

export interface GovernanceConfig {
    minStakeAmount: number;
    votingPeriod: number; 
    quorum: number;
    executionDelay: number;
    minVotingPeriod: number;
    maxVotingPeriod: number;
}

export enum ProposalState {
    Draft = 'draft',
    Active = 'active',
    Succeeded = 'succeeded',
    Executed = 'executed',
    Defeated = 'defeated',
    Cancelled = 'cancelled'
}

export interface ProposalMetadata {
    title: string;
    description: string;
    startTime: number;
    endTime: number;
    proposer: PublicKey;
    votes: Array<{
        voter: PublicKey;
        support: boolean;
        weight: number;
    }>;
    state: ProposalState;
    voteWeights: {
        yes: number;
        no: number;
        abstain: number;
    };
    quorum: number;
}

