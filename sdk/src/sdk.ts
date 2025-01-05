import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
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
    }) {
        // Default to testnet
        this.connection = new Connection(config.cluster || 'https://api.testnet.solana.com');
        
        // Use an obfuscated program ID if not specified
        this.programId = new PublicKey(
            config.programId || 'GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'
        );
    }

    private lastRequestTime = 0;
    private readonly MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

    private async checkRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            await new Promise(resolve => 
                setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = now;
    }

    private wallet: Keypair;

    constructor(config: {
        cluster?: string;
        wallet: Keypair;
        programId?: string;
    }) {
        // Default to testnet
        this.connection = new Connection(config.cluster || 'https://api.testnet.solana.com');
        
        // Use an obfuscated program ID if not specified
        this.programId = new PublicKey(
            config.programId || 'GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'
        );

        this.wallet = config.wallet;
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

        await this.checkRateLimit();

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
        // Validate parameters
        if (params.stakingAmount < 100) { // Minimum stake amount
            throw new Error('Insufficient stake amount');
        }

        const instruction = new TransactionInstruction({
            keys: [
                // Add account metas
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        const transaction = new Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [this.wallet]);

        return {
            id: 'proposal-' + signature.slice(0, 8),
            signature
        };
    }

    async vote(proposalId: string, support: boolean): Promise<string> {
        const instruction = new TransactionInstruction({
            keys: [
                // Add account metas
            ],
            programId: this.programId,
            data: Buffer.from([]) // Add instruction data
        });

        const transaction = new Transaction().add(instruction);
        return await this.connection.sendTransaction(transaction, []);
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

    async getProposalStatus(proposalId: string): Promise<{
        id: string;
        status: 'active' | 'executed' | 'defeated';
        votesFor: number;
        votesAgainst: number;
        endTime: number;
    }> {
        const result = await this.connection.getAccountInfo(new PublicKey(proposalId));
        if (!result) {
            throw new Error('Proposal not found');
        }

        // Parse account data
        return {
            id: proposalId,
            status: 'active',
            votesFor: 0,
            votesAgainst: 0,
            endTime: Date.now() + 86400000 // 24 hours from now
        };
    }
}
