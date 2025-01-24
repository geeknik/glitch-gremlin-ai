import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, VersionedMessage } from '@solana/web3.js';
import { GovernanceManager as SDKGovernanceManager, type GovernanceConfig } from '@glitch-gremlin/sdk';
import { GOVERNANCE_CONFIG } from './config/governance';
import { CLIError } from './utils/errors';

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

        this.sdkManager = new SDKGovernanceManager(
            connection,
            new PublicKey(GOVERNANCE_CONFIG.programId),
            {
                programId: new PublicKey(GOVERNANCE_CONFIG.programId),
                treasuryAddress: new PublicKey(GOVERNANCE_CONFIG.treasuryAddress),
                minStakeAmount: GOVERNANCE_CONFIG.minStakeAmount,
                votingPeriod: GOVERNANCE_CONFIG.votingPeriod,
                quorumPercentage: GOVERNANCE_CONFIG.quorumPercentage,
                executionDelay: GOVERNANCE_CONFIG.executionDelay
            }
        );
    }

    async initialize(): Promise<string> {
        try {
            const { tx: transaction } = await this.sdkManager.createProposal({
                proposer: this.wallet.publicKey,
                title: "Initialize Governance",
                description: "Initial setup of governance parameters"
            });
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(
                new VersionedTransaction(VersionedMessage.deserialize(transaction.serialize()))
            );
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to initialize governance', 'INITIALIZATION_FAILED');
        }
    }

    async createProposal(title: string, description: string): Promise<string> {
        try {
            const { tx: transaction } = await this.sdkManager.createProposal({
                proposer: this.wallet.publicKey,
                title,
                description
            });
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(
                new VersionedTransaction(VersionedMessage.deserialize(transaction.serialize()))
            );
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to create proposal', 'PROPOSAL_CREATION_FAILED');
        }
    }

    async vote(proposalId: string, support: boolean): Promise<string> {
        try {
            const transaction = await this.sdkManager.vote(
                new PublicKey(proposalId),
                support
            );
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(
                new VersionedTransaction(VersionedMessage.deserialize(transaction.serialize()))
            );
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to cast vote', 'VOTE_FAILED');
        }
    }

    async executeProposal(proposalId: string): Promise<string> {
        try {
            const transaction = await this.sdkManager.executeProposal(
                this.connection,
                this.wallet,
                new PublicKey(proposalId)
            );
            
            transaction.sign(this.wallet);
            const signature = await this.connection.sendTransaction(
                new VersionedTransaction(VersionedMessage.deserialize(transaction.serialize()))
            );
            await this.connection.confirmTransaction(signature);
            
            return signature;
        } catch (error) {
            throw new GlitchError('Failed to execute proposal', 'EXECUTION_FAILED');
        }
    }
}
