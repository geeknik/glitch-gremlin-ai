import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import { ChaosRequestParams, ChaosResult, TestType } from './types';
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
        cluster: string;
        wallet: Keypair;
        programId?: string;
    }) {
        this.connection = new Connection(config.cluster);
        this.programId = new PublicKey(
            config.programId || 'GremLinXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
        );
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
        // TODO: Implement status checking
        throw new Error('Not implemented');
    }

    async cancelRequest(requestId: string): Promise<void> {
        // TODO: Implement request cancellation
        throw new Error('Not implemented');
    }
}
