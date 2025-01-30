import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Redis as RedisClient } from 'ioredis';
import { SDKConfig, RedisConfig } from '../types.js';
import { GovernanceManager, GovernanceConfig } from '../governance.js';
import { GlitchError, ErrorCode } from '../errors.js';
import { RedisFactory } from '../utils/redis-factory.js';

// Default governance configuration
const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
    minStakeAmount: 1_000_000_000, // 1 SOL
    maxStakeAmount: 1_000_000_000_000, // 1000 SOL
    minUnstakeAmount: 100_000_000, // 0.1 SOL
    maxUnstakeAmount: 1_000_000_000_000, // 1000 SOL
    minProposalStake: 10_000_000_000, // 10 SOL
    quorumPercentage: 51, // 51%
    votingPeriod: 7 * 24 * 60 * 60, // 7 days in seconds
    executionDelay: 24 * 60 * 60, // 24 hours in seconds
    proposalThreshold: 100_000_000_000, // 100 SOL
    quorum: 1_000_000_000_000, // 1000 SOL
    programId: new PublicKey('11111111111111111111111111111111'), // Replace with actual program ID
    treasuryAddress: new PublicKey('11111111111111111111111111111111'), // Replace with actual treasury address
    voteWeights: {
        yes: 1,
        no: 1,
        abstain: 0
    }
};

export class GlitchSDK {
    private redis: RedisClient | null = null;
    private connection: Connection;
    private wallet: Keypair;
    private governanceManager: GovernanceManager;
    private readonly config: SDKConfig;

    constructor(config: SDKConfig) {
        this.config = config;
        this.connection = new Connection(config.cluster || clusterApiUrl('devnet'));
        this.wallet = config.wallet;
        this.governanceManager = new GovernanceManager(
            this.connection,
            this.wallet,
            this.getGovernanceConfig()
        );
    }

    private async initializeRedis(): Promise<void> {
        if (this.config.redisConfig) {
            try {
                this.redis = await RedisFactory.createInstance(this.config.redisConfig as RedisConfig);
            } catch (error) {
                throw new GlitchError(
                    'Failed to initialize Redis connection',
                    ErrorCode.REDIS_NOT_CONFIGURED
                );
            }
        }
    }

    private async ensureRedisConnected(): Promise<void> {
        if (!this.redis) {
            await this.initializeRedis();
        }

        if (this.redis) {
            try {
                await this.redis.ping();
            } catch (error) {
                throw new GlitchError(
                    'Redis connection lost',
                    ErrorCode.REDIS_ERROR
                );
            }
        }
    }

    private getGovernanceConfig(): GovernanceConfig {
        const config: GovernanceConfig = {
            programId: this.config.programId ? new PublicKey(this.config.programId) : DEFAULT_GOVERNANCE_CONFIG.programId,
            treasuryAddress: DEFAULT_GOVERNANCE_CONFIG.treasuryAddress,
            minStakeAmount: this.config.governanceConfig?.minStakeAmount ?? DEFAULT_GOVERNANCE_CONFIG.minStakeAmount,
            maxStakeAmount: this.config.governanceConfig?.maxStakeAmount ?? DEFAULT_GOVERNANCE_CONFIG.maxStakeAmount,
            votingPeriod: this.config.governanceConfig?.votingPeriod ?? DEFAULT_GOVERNANCE_CONFIG.votingPeriod,
            quorum: this.config.governanceConfig?.quorum ?? DEFAULT_GOVERNANCE_CONFIG.quorum,
            minUnstakeAmount: this.config.governanceConfig?.minUnstakeAmount ?? DEFAULT_GOVERNANCE_CONFIG.minUnstakeAmount,
            maxUnstakeAmount: this.config.governanceConfig?.maxUnstakeAmount ?? DEFAULT_GOVERNANCE_CONFIG.maxUnstakeAmount,
            minProposalStake: this.config.governanceConfig?.minProposalStake ?? DEFAULT_GOVERNANCE_CONFIG.minProposalStake,
            quorumPercentage: this.config.governanceConfig?.quorumPercentage ?? DEFAULT_GOVERNANCE_CONFIG.quorumPercentage,
            executionDelay: this.config.governanceConfig?.executionDelay ?? DEFAULT_GOVERNANCE_CONFIG.executionDelay,
            proposalThreshold: this.config.governanceConfig?.proposalThreshold ?? DEFAULT_GOVERNANCE_CONFIG.proposalThreshold,
            voteWeights: this.config.governanceConfig?.voteWeights ?? DEFAULT_GOVERNANCE_CONFIG.voteWeights
        };
        return config;
    }

    // ... rest of the SDK implementation ...

    public async cleanup(): Promise<void> {
        await RedisFactory.closeConnection();
        this.redis = null;
    }
} 
