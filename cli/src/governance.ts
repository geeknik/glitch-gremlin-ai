import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { GovernanceManager as SDKGovernanceManager, GovernanceConfig } from '../../sdk/src/governance';
import { GOVERNANCE_CONFIG } from '../config/governance';
import { GlitchError } from '../utils/errors';

export class GovernanceManager {
    private sdkManager: SDKGovernanceManager;
    private connection: Connection;
    private wallet: Keypair;

    constructor(connection: Connection, wallet: Keypair) {
        this.connection = connection;
        this.wallet = wallet;
        
        const config: GovernanceConfig = {
            programId: new PublicKey(GOVERNANCE_CONFIG.programId),
            treasuryAddress: new PublicKey(GOVERNANCE_CONFIG.treasuryAddress),
            minStakeAmount: 100,
            votingPeriod: 7 * 24 * 60 * 60, // 1 week in seconds
            quorumPercentage: 10, // 10%
            executionDelay: 2 * 24 * 60 * 60 // 2 days in seconds
        };

        this.sdkManager = new SDKGovernanceManager(connection, config);
    }

    async initialize(): Promise<string> {
        try {
            const { transaction } = await this.sdkManager.createProposal(
                this.wallet.publicKey,
                "Initialize Governance",
                "Initial setup of governance parameters"
            );
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to initialize governance', 'INITIALIZATION_FAILED');
        }
    }

    async createProposal(title: string, description: string): Promise<string> {
        try {
            const { proposal, transaction } = await this.sdkManager.createProposal(
                this.wallet.publicKey,
                title,
                description
            );
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);
            
            return proposal.id;
        } catch (error) {
            throw new GlitchError('Failed to create proposal', 'PROPOSAL_CREATION_FAILED');
        }
    }

    async vote(proposalId: string, support: boolean): Promise<string> {
        try {
            const transaction = await this.sdkManager.vote(
                proposalId,
                this.wallet.publicKey,
                support
            );
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to cast vote', 'VOTE_FAILED');
        }
    }

    async executeProposal(proposalId: string): Promise<string> {
        try {
            const transaction = await this.sdkManager.executeProposal(proposalId);
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to execute proposal', 'EXECUTION_FAILED');
        }
    }
}
