import { 
    Connection,
    Keypair,
    PublicKey, 
    Transaction, 
    TransactionInstruction 
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { GlitchError, ErrorCode } from './errors.js';
import type { Commitment, GetAccountInfoConfig } from '@solana/web3.js';
import { ProposalState, GovernanceConfig, ProposalMetadata } from './types.js';

export class GovernanceManager {
    private readonly DEFAULT_CONFIG: GovernanceConfig = {
        minStakeAmount: 1000,
        votingPeriod: 259200, // 3 days in seconds
        quorum: 10, // 10% of total supply
        executionDelay: 86400, // 24 hours in seconds
        minVotingPeriod: 86400, // 1 day
        maxVotingPeriod: 604800 // 1 week
    };

    private config: GovernanceConfig;
    private proposalAccountSize: number = 1024; // Size in bytes for proposal accounts

    constructor(
        private programId: PublicKey,
        config: Partial<GovernanceConfig> = {}
    ) {
        this.config = { ...this.DEFAULT_CONFIG, ...config };
    }


    public async validateProposal(
        connection: Connection,
        proposalAddress: PublicKey
    ): Promise<ProposalMetadata> {
        const account = await connection.getAccountInfo(proposalAddress);
        if (!account) {
            throw new GlitchError('Proposal not found', ErrorCode.PROPOSAL_NOT_FOUND);
        }

        // Deserialize account data into ProposalMetadata
        const metadata = this.deserializeProposalData(account.data);
        
        if (Date.now() < metadata.startTime) {
            throw new GlitchError('Proposal voting has not started', ErrorCode.PROPOSAL_NOT_ACTIVE);
        }
        
        if (Date.now() > metadata.endTime) {
            throw new GlitchError('Proposal voting has ended', ErrorCode.PROPOSAL_REJECTED);
        }

        // Check quorum
        const totalVotes = metadata.voteWeights.yes + metadata.voteWeights.no + metadata.voteWeights.abstain;
        if (totalVotes < metadata.quorum) {
            throw new GlitchError('Proposal has not reached quorum', ErrorCode.PROPOSAL_NOT_REACHED_QUORUM);
        }

        return metadata;
    }
    private deserializeProposalData(data: Buffer): ProposalMetadata {
        try {
            const decodedData = JSON.parse(data.toString());
            if (!this.isValidProposalMetadata(decodedData)) {
                throw new GlitchError('Invalid proposal data format', ErrorCode.INVALID_PROPOSAL_DATA);
            }
            return decodedData;
        } catch (err) {
            throw new GlitchError('Failed to deserialize proposal data', ErrorCode.INVALID_PROPOSAL_DATA);
        }
    }

    private isValidProposalMetadata(data: any): data is ProposalMetadata {
        return (
            data &&
            typeof data.startTime === 'number' &&
            typeof data.endTime === 'number' &&
            typeof data.quorum === 'number' &&
            data.votes && Array.isArray(data.votes) &&
            data.voteWeights && 
            typeof data.voteWeights.yes === 'number' &&
            typeof data.voteWeights.no === 'number' &&
            typeof data.voteWeights.abstain === 'number'
        );
    }

    public async createProposalAccount(
        connection: Connection,
        wallet: Keypair,
        params: { 
        votingPeriod: number;
        minStake?: number;
        quorum?: number;
        }
    ): Promise<{ proposalAddress: PublicKey; tx: Transaction }> {
        const minPeriod = this.config.minVotingPeriod;
        const maxPeriod = this.config.maxVotingPeriod;
        
        if (params.votingPeriod < minPeriod ||
            params.votingPeriod > maxPeriod) {
            throw new GlitchError('Invalid voting period', ErrorCode.INVALID_VOTING_PERIOD);
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

    async getProposalState(
    connection: Connection, 
    proposalAddress: PublicKey,
    commitment?: GetAccountInfoConfig
    ): Promise<ProposalState> {
    const account = await connection.getAccountInfo(proposalAddress, commitment);
        if (!account) {
            throw new GlitchError('Proposal not found', ErrorCode.PROPOSAL_NOT_FOUND);
        }
        // TODO: Deserialize account data
        return ProposalState.Active;
    }

    async castVote(
        connection: Connection,
        wallet: Keypair,
        proposalAddress: PublicKey,
        support: boolean,
        weight?: number,
        _commitment?: Commitment
    ): Promise<Transaction> {
        const metadata = await this.validateProposal(connection, proposalAddress);

        // Check if wallet has already voted
        const hasVoted = metadata.votes.some(v => v.voter.equals(wallet.publicKey));
        if (hasVoted) {
            throw new GlitchError('Already voted on this proposal', ErrorCode.INVALID_VOTE);
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

    private async calculateVoteWeight(
        connection: Connection,
        voter: PublicKey,
        commitment?: Commitment
    ): Promise<number> {
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

    async executeProposal(
        connection: Connection,
        wallet: Keypair,
        proposalAddress: PublicKey,
        config?: {commitment?: Commitment}
    ): Promise<Transaction> {
        const state = await this.getProposalState(connection, proposalAddress);
        if (state !== ProposalState.Succeeded) {
            throw new GlitchError('Proposal cannot be executed', ErrorCode.INVALID_VOTE);
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
