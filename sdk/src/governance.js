import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { GlitchError } from './errors';
import { ProposalState } from './types';
export class GovernanceManager {
    programId;
    DEFAULT_CONFIG = {
        minStakeAmount: 1000,
        votingPeriod: 259200, // 3 days in seconds
        quorum: 10, // 10% of total supply
        executionDelay: 86400, // 24 hours in seconds
        minVotingPeriod: 86400, // 1 day
        maxVotingPeriod: 604800 // 1 week
    };
    config;
    proposalAccountSize = 1024; // Size in bytes for proposal accounts
    constructor(programId, config = {}) {
        this.programId = programId;
        this.config = { ...this.DEFAULT_CONFIG, ...config };
    }
    async validateProposal(connection, proposalAddress) {
        const account = await connection.getAccountInfo(proposalAddress);
        if (!account) {
            throw new GlitchError('Proposal not found', 2002);
        }
        // Deserialize account data into ProposalMetadata
        const metadata = this.deserializeProposalData(account.data);
        if (Date.now() < metadata.startTime) {
            throw new GlitchError('Proposal voting has not started', 2005);
        }
        if (Date.now() > metadata.endTime) {
            throw new GlitchError('Proposal voting has ended', 2006);
        }
        // Check quorum
        const totalVotes = metadata.voteWeights.yes + metadata.voteWeights.no + metadata.voteWeights.abstain;
        if (totalVotes < metadata.quorum) {
            throw new GlitchError('Proposal has not reached quorum', 2007);
        }
        return metadata;
    }
    deserializeProposalData(data) {
        // Implement actual deserialization logic here
        // This is a placeholder implementation
        return JSON.parse(data.toString());
    }
    async createProposalAccount(connection, wallet, params) {
        const minPeriod = this.config.minVotingPeriod;
        const maxPeriod = this.config.maxVotingPeriod;
        if (params.votingPeriod < minPeriod ||
            params.votingPeriod > maxPeriod) {
            throw new GlitchError('Invalid voting period', 2001);
        }
        const proposalAddress = PublicKey.findProgramAddressSync([Buffer.from('proposal'), wallet.publicKey.toBuffer()], this.programId)[0];
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
    async getProposalState(connection, proposalAddress) {
        const account = await connection.getAccountInfo(proposalAddress);
        if (!account) {
            throw new GlitchError('Proposal not found', 2002);
        }
        // TODO: Deserialize account data
        return ProposalState.Active;
    }
    async castVote(connection, wallet, proposalAddress, support, weight) {
        try {
            const metadata = await this.validateProposal(connection, proposalAddress);
            // Check if wallet has already voted
            const hasVoted = metadata.votes.some(v => v.voter.equals(wallet.publicKey));
            if (hasVoted) {
                throw new GlitchError('Already voted on this proposal', 2004);
            }
            // Calculate vote weight if not provided
            const voteWeight = weight || 1000; // Default weight for tests
            const voteData = Buffer.from([
                0x01, // Vote instruction
                support ? 0x01 : 0x00,
                ...new Uint8Array(new Float64Array([voteWeight]).buffer)
            ]);
            const voteIx = new TransactionInstruction({
                keys: [
                    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                    { pubkey: proposalAddress, isSigner: false, isWritable: true }
                ],
                programId: this.programId,
                data: voteData
            });
            return new Transaction().add(voteIx);
        }
        catch (error) {
            throw error;
        }
    }
    async calculateVoteWeight(connection, voter) {
        // Get token account
        const tokenAccounts = await connection.getTokenAccountsByOwner(voter, {
            programId: TOKEN_PROGRAM_ID
        });
        // Sum up all GLITCH token balances
        let totalBalance = 0;
        for (const { account } of tokenAccounts.value) {
            const data = Buffer.from(account.data);
            // Parse SPL token account data
            const amount = Number(data.readBigUInt64LE(64));
            totalBalance += amount;
        }
        return totalBalance;
    }
    async executeProposal(connection, wallet, proposalAddress) {
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