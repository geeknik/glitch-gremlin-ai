import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { Redis } from 'ioredis';
import { RedisQueueWorker } from './queue/redis-queue-worker.js';
import { GovernanceManager } from './governance.js';
import { GlitchError, ErrorCode } from './errors.js';
import type { 
    ChaosRequestParams, 
    ChaosRequest,
    TestResult,
    GovernanceConfig,
    SDKConfig 
} from './types.js';

export { TestType } from './types.js';
export { GlitchError, ErrorCode } from './errors.js';

interface SDKInitParams {
    cluster?: string;
    wallet?: Keypair;
    programId?: string;
    governanceConfig?: Partial<GovernanceConfig>;
    redisConfig?: {
        url?: string;
        host?: string;
        port?: number;
        password?: string;
    };
    heliusApiKey?: string;
}

export class GlitchSDK {
    private connection: Connection;
    private wallet: Keypair;
    private programId: string;
    private queueWorker: RedisQueueWorker;
    private governanceManager: GovernanceManager;
    private config: SDKConfig;

    private constructor(
        connection: Connection,
        wallet: Keypair,
        programId: string,
        queueWorker: RedisQueueWorker,
        governanceManager: GovernanceManager,
        config: SDKConfig
    ) {
        this.connection = connection;
        this.wallet = wallet;
        this.programId = programId;
        this.queueWorker = queueWorker;
        this.governanceManager = governanceManager;
        this.config = config;
    }

    public static async create(params: SDKInitParams): Promise<GlitchSDK> {
        const {
            cluster = 'devnet',
            wallet = Keypair.generate(),
            programId = 'GREMhwWXYqALHKkAjX1N97V2BbqQzrBxnqurY3yUeqAE',
            redisConfig = {},
            governanceConfig = {},
            heliusApiKey
        } = params;

        // Initialize connection
        const rpcUrl = heliusApiKey 
            ? `https://rpc-${cluster}.helius.xyz/?api-key=${heliusApiKey}`
            : `https://api.${cluster}.solana.com`;
        
        const connection = new Connection(rpcUrl, 'confirmed');

        // Initialize Redis client
        const redisUrl = redisConfig.url || process.env.REDIS_URL;
        let redisClient: Redis;
        
        if (redisUrl) {
            redisClient = new Redis(redisUrl);
        } else {
            redisClient = new Redis({
                host: redisConfig.host || 'localhost',
                port: redisConfig.port || 6379,
                password: redisConfig.password
            });
        }

        // Initialize queue worker
        const queueWorker = new RedisQueueWorker(redisClient);
        await queueWorker.initialize();

        // Initialize governance manager with default values if not provided
        const defaultGovernanceConfig: GovernanceConfig = {
            programId: new PublicKey(programId),
            minStakeAmount: 100_000_000, // 0.1 SOL
            votingPeriod: 24 * 60 * 60, // 24 hours
            quorum: 10 // 10%
        };

        const mergedGovernanceConfig = {
            ...defaultGovernanceConfig,
            ...governanceConfig,
            programId: new PublicKey(governanceConfig.programId || programId)
        };

        const governanceManager = new GovernanceManager(
            connection, 
            wallet, 
            mergedGovernanceConfig
        );

        const config: SDKConfig = {
            cluster,
            programId,
            redisConfig: {
                host: redisConfig.host || 'localhost',
                port: redisConfig.port || 6379,
                password: redisConfig.password
            },
            governanceConfig: mergedGovernanceConfig,
            heliusApiKey,
            wallet: wallet.publicKey
        };

        return new GlitchSDK(
            connection,
            wallet,
            programId,
            queueWorker,
            governanceManager,
            config
        );
    }

    public async createChaosRequest(params: ChaosRequestParams): Promise<ChaosRequest> {
        // Validate parameters
        if (params.intensity < 1 || params.intensity > 10) {
            throw new GlitchError(
                'Intensity must be between 1 and 10',
                ErrorCode.INVALID_PARAMS
            );
        }

        if (params.duration < 60 || params.duration > 3600) {
            throw new GlitchError(
                'Duration must be between 60 and 3600 seconds',
                ErrorCode.INVALID_PARAMS
            );
        }

        // Create request ID
        const requestId = `chaos-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Create request object
        const request: ChaosRequest = {
            requestId,
            ...params,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Queue the request
        await this.queueWorker.enqueueRequest(request);

        return request;
    }

    public async waitForTestResult(requestId: string): Promise<TestResult> {
        const maxAttempts = 60; // 5 minutes with 5 second intervals
        const interval = 5000; // 5 seconds

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const result = await this.queueWorker.getTestResult(requestId);
            if (result) {
                return result;
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new GlitchError(
            'Test result timeout',
            ErrorCode.TIMEOUT
        );
    }

    public async cleanup(): Promise<void> {
        if (this.queueWorker) {
            await this.queueWorker.close();
        }
    }
}
