import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { GlitchError } from './errors';
import { ProposalState, GovernanceConfig } from './types';

export class GovernanceManager {
    private readonly DEFAULT_CONFIG: GovernanceConfig = {
        minStakeAmount: 1000,
        votingPeriod: 259200, // 3 days in seconds
        quorum: 10, // 10% of total supply
        executionDelay: 86400, // 24 hours in seconds
        minVotingPeriod: 86400, // 1 day
        maxVotingPeriod: 604800 // 1 week
    };

    constructor(private programId: PublicKey, private config: GovernanceConfig = {}) {
        this.config = { ...this.DEFAULT_CONFIG, ...config };
    }

    async createProposalAccount(
        connection: any,
        wallet: any,
        params: any
    ): Promise<{ proposalAddress: PublicKey; tx: Transaction }> {
        if (params.votingPeriod < this.config.minVotingPeriod || 
            params.votingPeriod > this.config.maxVotingPeriod) {
            throw new GlitchError('Invalid voting period', 2001);
        }

        const proposalAddress = PublicKey.findProgramAddressSync(
            [Buffer.from('proposal'), wallet.publicKey.toBuffer()],
            this.programId
        )[0];

        const createProposalIx = new TransactionInstruction({
            keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: proposalAddress, isSigner: false, isWritable: true }
            ],
            programId: this.programId,
            data: Buffer.from([]) // TODO: Serialize proposal data
        });

        const tx = new Transaction().add(createProposalIx);
        return { proposalAddress, tx };
    }

    async getProposalState(connection: any, proposalAddress: PublicKey): Promise<ProposalState> {
        const account = await connection.getAccountInfo(proposalAddress);
        if (!account) {
            throw new GlitchError('Proposal not found', 2002);
        }
        // TODO: Deserialize account data
        return ProposalState.Active;
    }

    async castVote(
        connection: any,
        wallet: any,
        proposalAddress: PublicKey,
        support: boolean
    ): Promise<Transaction> {
        const state = await this.getProposalState(connection, proposalAddress);
        if (state !== ProposalState.Active) {
            throw new GlitchError('Proposal is not active', 2003);
        }

        const voteIx = new TransactionInstruction({
            keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: proposalAddress, isSigner: false, isWritable: true }
            ],
            programId: this.programId,
            data: Buffer.from([0x01, support ? 0x01 : 0x00]) // Vote instruction
        });

        return new Transaction().add(voteIx);
    }

    async executeProposal(
        connection: any,
        wallet: any,
        proposalAddress: PublicKey
    ): Promise<Transaction> {
        const state = await this.getProposalState(connection, proposalAddress);
        if (state !== ProposalState.Succeeded) {
            throw new GlitchError('Proposal cannot be executed', 2004);
        }

        const executeIx = new TransactionInstruction({
            keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: proposalAddress, isSigner: false, isWritable: true }
            ],
            programId: this.programId,
            data: Buffer.from([0x02]) // Execute instruction
        });

        return new Transaction().add(executeIx);
    }
}
