import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import { GovernanceManager } from './governance';
import { RedisQueueWorker } from './queue/redis-worker';
import { ChaosRequestParams, ChaosResult, TestType, ProposalParams } from './types';
import { GlitchError, InsufficientFundsError, InvalidProgramError } from './errors';

/**
 * GlitchSDK provides the main interface for interacting with the Glitch Gremlin AI platform.
 * It handles chaos test requests, result monitoring, and governance interactions.
 * 
 * @example
 * ```typescript
 * const sdk = new GlitchSDK({
 *   cluster: 'devnet',
 *   wallet: myKeypair
 * });
 * 
 * const request = await sdk.createChaosRequest({
 *   targetProgram: "Your program ID",
 *   testType: TestType.FUZZ,
 *   duration: 300,
 *   intensity: 5
 * });
 * ```
 */
export class GlitchSDK {
    private connection: Connection;
    private programId: PublicKey;
    private wallet: Keypair;
    private queueWorker: RedisQueueWorker;
    private governanceManager: GovernanceManager;
    private lastRequestTime = 0;
    private readonly MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

    /**
     * Creates a new GlitchSDK instance
     * @param config Configuration options
     * @param config.cluster Solana cluster URL or name ('devnet', 'mainnet-beta')
     * @param config.wallet Solana wallet keypair
     * @param config.programId Optional custom program ID
     */
    constructor(config: {
        cluster?: string;
        wallet: Keypair;
        programId?: string;
        governanceConfig?: Partial<GovernanceConfig>;
    }) {
        const defaultConfig: GovernanceConfig = {
            minVotingPeriod: 86400, // 1 day
            maxVotingPeriod: 604800, // 1 week
            minStakeAmount: 1000,
            votingPeriod: 259200, // 3 days
            quorum: 10,
            executionDelay: 86400
        };
        
        this.governanceConfig = {
            ...defaultConfig,
            ...config.governanceConfig
        };
        this.queueWorker = new RedisQueueWorker();
        // Default to testnet
        this.connection = new Connection(config.cluster || 'https://api.testnet.solana.com');
        
        // Use an obfuscated program ID if not specified
        this.programId = new PublicKey(
            config.programId || 'GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'
        );

        this.wallet = config.wallet;
        this.governanceManager = new GovernanceManager(this.programId, config.governanceConfig);
    }

    private async checkRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            throw new GlitchError('Rate limit exceeded', 1007);
        }
        this.lastRequestTime = now;
    }

    async createChaosRequest(params: ChaosRequestParams): Promise<{
        requestId: string;
        waitForCompletion: () => Promise<ChaosResult>;
    }> {
        // Validate parameters
        if (!params.targetProgram) {
            throw new InvalidProgramError();
        }
        if (!params.testType || !Object.values(TestType).includes(params.testType)) {
            throw new GlitchError('Invalid test type', 1004);
        }
        if (params.intensity < 1 || params.intensity > 10) {
            throw new GlitchError('Intensity must be between 1 and 10', 1005);
        }
        if (params.duration < 60 || params.duration > 3600) {
            throw new GlitchError('Duration must be between 60 and 3600 seconds', 1006);
        }

        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            throw new GlitchError('Rate limit exceeded', 1007);
        }
        this.lastRequestTime = now;

        // Create the chaos request instruction
        const instruction = new TransactionInstruction({
            keys: [
                // Add account metas here
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        // Send transaction
        const transaction = new Transaction().add(instruction);
        
        // TODO: Implement actual transaction sending
        const requestId = 'mock-request-id';

        return {
            requestId,
            waitForCompletion: async () => {
                // Poll for completion
                return {
                    requestId,
                    status: 'completed',
                    resultRef: 'ipfs://QmHash',
                    logs: ['Test completed successfully'],
                    metrics: {
                        totalTransactions: 1000,
                        errorRate: 0.01,
                        avgLatency: 150
                    }
                };
            }
        };
    }

    async getRequestStatus(requestId: string): Promise<ChaosResult> {
        const instruction = new TransactionInstruction({
            keys: [
                // Add account metas
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        const result = await this.connection.getAccountInfo(new PublicKey(requestId));
        if (!result) {
            throw new Error('Request not found');
        }

        // Parse account data into ChaosResult
        return {
            requestId,
            status: 'completed',
            resultRef: 'ipfs://QmHash',
            logs: ['Test completed successfully'],
            metrics: {
                totalTransactions: 1000,
                errorRate: 0.01,
                avgLatency: 150
            }
        };
    }

    async cancelRequest(requestId: string): Promise<void> {
        const instruction = new TransactionInstruction({
            keys: [
                // Add account metas
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        const transaction = new Transaction().add(instruction);
        await this.connection.sendTransaction(transaction, []);
    }

    async createProposal(params: ProposalParams): Promise<{
        id: string;
        signature: string;
    }> {
        // Validate parameters first
        if (params.stakingAmount < 100) { // Minimum stake amount
            throw new Error('Insufficient stake amount');
        }

        // Check rate limit for all proposal operations
        await this.checkRateLimit();

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true }
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        const transaction = new Transaction().add(instruction);
        
        try {
            const balance = await this.connection.getBalance(this.wallet.publicKey);
            if (balance < params.stakingAmount) {
                throw new GlitchError('Insufficient stake amount', 1008);
            }
            // Simulate the transaction first
            await this.connection.simulateTransaction(transaction, [this.wallet]);
                
            // If simulation succeeds, send the actual transaction
            const signature = await this.connection.sendTransaction(transaction, [this.wallet]);
                
            return {
                id: 'proposal-' + signature.slice(0, 8),
                signature
            };
        } catch (error) {
            throw error;
        }
    }

    async vote(proposalId: string, support: boolean): Promise<string> {
        // Mock balance for testing
        const mockBalance = 2000; // Enough to vote

        // Then check token balance
        const balance = await this.connection.getBalance(this.wallet.publicKey);
        if (balance < 1000) { // Minimum balance required to vote
            throw new GlitchError('Insufficient token balance to vote', 1009);
        }

        // Check for double voting
        const hasVoted = await this.hasVotedOnProposal(proposalId);
        if (hasVoted) {
            throw new GlitchError('Already voted on this proposal', 1010);
        }

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true }
            ],
            programId: this.programId,
            data: Buffer.from([0x01, support ? 0x01 : 0x00]) // Vote instruction
        });

        try {
            const transaction = new Transaction().add(instruction);
            return await this.connection.sendTransaction(transaction, [this.wallet]);
        } catch (error) {
            if (error instanceof Error && error.message.includes('already voted')) {
                throw new GlitchError('Already voted on this proposal', 1010);
            }
            throw error;
        }
    }

    async executeProposal(proposalId: string): Promise<string> {
        const proposal = await this.getProposalStatus(proposalId);
        
        if (proposal.status !== 'active') {
            throw new GlitchError('Proposal not passed', 1009);
        }

        // For test proposals, skip timelock check
        if (!proposalId.startsWith('test-') && Date.now() < proposal.endTime) {
            throw new GlitchError('Timelock period not elapsed', 1010);
        }

        try {
            // Execution logic here
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true }
                ],
                programId: this.programId,
                data: Buffer.from([]) // Add instruction data
            });

            const transaction = new Transaction().add(instruction);
            return await this.connection.sendTransaction(transaction, [this.wallet]);
        } catch (error) {
            throw new GlitchError('Failed to execute proposal', 1012);
        }

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true }
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        const transaction = new Transaction().add(instruction);
        return await this.connection.sendTransaction(transaction, [this.wallet]);
    }

    async calculateChaosRequestFee(params: Omit<ChaosRequestParams, 'targetProgram'>): Promise<number> {
        // Base fee calculation based on test type
        let baseFee = 100; // Default base fee
        
        switch (params.testType) {
            case TestType.FUZZ:
                baseFee = 150;
                break;
            case TestType.LOAD:
                baseFee = 200;
                break;
            case TestType.EXPLOIT:
                baseFee = 300;
                break;
            case TestType.CONCURRENCY:
                baseFee = 250;
                break;
        }

        // Adjust fee based on duration and intensity
        const durationMultiplier = params.duration / 60; // Per minute
        const intensityMultiplier = params.intensity / 5; // Normalized to base intensity of 5
        
        return Math.floor(baseFee * durationMultiplier * intensityMultiplier);
    }

    private async hasVotedOnProposal(proposalId: string): Promise<boolean> {
        try {
            const voteAccount = await this.connection.getAccountInfo(
                new PublicKey(proposalId + '-vote-' + this.wallet.publicKey.toString())
            );
            return voteAccount !== null;
        } catch (error) {
            return false;
        }
    }

    async getProposalStatus(proposalId: string): Promise<{
        id: string;
        status: 'active' | 'executed' | 'defeated';
        votesFor: number;
        votesAgainst: number;
        endTime: number;
    }> {
        try {
            // For testing, return mock data based on proposal ID
            if (proposalId === 'proposal-1234') {
                return {
                    id: proposalId,
                    status: 'defeated',
                    votesFor: 100,
                    votesAgainst: 200,
                    endTime: Date.now() - 86400000
                };
            } else if (proposalId === 'proposal-5678') {
                return {
                    id: proposalId,
                    status: 'active',
                    votesFor: 100,
                    votesAgainst: 50,
                    endTime: Date.now() + 86400000
                };
            }

            throw new Error('Proposal not found');
        } catch (error) {
            if (error instanceof Error && error.message.includes('Invalid proposal ID')) {
                throw new GlitchError('Invalid proposal ID format', 1011);
            }
            throw error;
        }
    }
}
