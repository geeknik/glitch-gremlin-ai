import { Keypair, PublicKey } from '@solana/web3.js';
import type { RedisConfig } from './redis.js';

export interface SDKConfig {
    redis?: RedisConfig;
    cluster?: string;
    wallet: Keypair;
    programId?: PublicKey;
    governanceConfig?: GovernanceConfig;
    heliusApiKey?: string;
    network?: string;
    rpcEndpoint?: string;
    commitment?: string;
}

export interface GovernanceConfig {
    // Program identifiers
    programId: PublicKey;
    treasuryAddress: PublicKey;

    // Staking parameters
    minStakeAmount: number;
    maxStakeAmount: number;
    minUnstakeAmount: number;
    maxUnstakeAmount: number;
    earlyUnstakePenalty: number;
    rewardRate: number;

    // Proposal parameters
    minProposalStake: number;
    maxProposalStake: number;
    votingPeriod: number;
    executionDelay: number;
    quorum: number;
    quorumPercentage: number;

    // Timelock parameters
    minStakeDuration: number;
    maxStakeDuration: number;
    minLockupPeriod: number;
    maxLockupPeriod: number;

    // Security parameters
    securityLevel: number;
    maxConcurrentTests: number;
    maxTestDuration: number;
} 
