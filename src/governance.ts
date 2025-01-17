import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { ProposalState } from './types.js';
import { GlitchError } from './errors';

export interface GovernanceConfig {
    minStakeAmount: number;
    votingPeriod: number;
    quorumPercentage: number;
    executionDelay: number;
    programId: PublicKey;
    treasuryAddress: PublicKey;
}

export interface Proposal {
    id: string;
    proposer: PublicKey;
    title: string;
    description: string;
    state: ProposalState;
    yesVotes: number;
    noVotes: number;
    startTime: number;
    endTime: number;
    executionTime: number;
    treasury: PublicKey;
}

export class GovernanceManager {
    private connection: Connection;
    private config: GovernanceConfig;

    constructor(connection: Connection, config: GovernanceConfig) {
        this.connection = connection;
        this.config = config;
    }

    async createProposal(
        proposer: PublicKey,
        title: string,
        description: string,
        votingPeriod?: number
    ): Promise<{ proposal: Proposal; transaction: Transaction }> {
        if (!title || !description) {
            throw new GlitchError('Invalid proposal parameters');
        }

        const period = votingPeriod || this.config.votingPeriod;
        const now = Math.floor(Date.now() / 1000);

        const proposalKeypair = Keypair.generate();
        const transaction = new Transaction();

        transaction.add(
            new TransactionInstruction({
                keys: [
                    { pubkey: proposalKeypair.publicKey, isSigner: true, isWritable: true },
                    { pubkey: proposer, isSigner: true, isWritable: false },
                    { pubkey: this.config.treasuryAddress, isSigner: false, isWritable: false }
                ],
                programId: this.config.programId,
                data: Buffer.from([
                    0, // Create proposal instruction
                    ...Buffer.from(title),
                    ...Buffer.from(description),
                    ...new Uint8Array(new Float64Array([period]).buffer)
                ])
            })
        );

        const proposal: Proposal = {
            id: proposalKeypair.publicKey.toBase58(),
            proposer,
            title,
            description,
            state: ProposalState.Active,
            yesVotes: 0,
            noVotes: 0,
            startTime: now,
            endTime: now + period,
            executionTime: now + period + this.config.executionDelay,
            treasury: this.config.treasuryAddress
        };

        return { proposal, transaction };
    }

    async vote(
        proposalId: string,
        voter: PublicKey,
        voteYes: boolean
    ): Promise<Transaction> {
        const proposalPubkey = new PublicKey(proposalId);
        const proposal = await this.getProposal(proposalId);

        if (proposal.state !== ProposalState.Active) {
            throw new GlitchError('Proposal is not active');
        }

        if (Date.now() / 1000 > proposal.endTime) {
            throw new GlitchError('Voting period has ended');
        }

        const transaction = new Transaction();
        transaction.add(
            new TransactionInstruction({
                keys: [
                    { pubkey: proposalPubkey, isSigner: false, isWritable: true },
                    { pubkey: voter, isSigner: true, isWritable: false }
                ],
                programId: this.config.programId,
                data: Buffer.from([
                    1, // Vote instruction
                    voteYes ? 1 : 0
                ])
            })
        );

        return transaction;
    }

    async executeProposal(proposalId: string): Promise<Transaction> {
        const proposalPubkey = new PublicKey(proposalId);
        const proposal = await this.getProposal(proposalId);

        if (proposal.state !== ProposalState.Succeeded) {
            throw new GlitchError('Proposal cannot be executed');
        }

        if (Date.now() / 1000 < proposal.executionTime) {
            throw new GlitchError('Execution delay has not elapsed');
        }

        const transaction = new Transaction();
        transaction.add(
            new TransactionInstruction({
                keys: [
                    { pubkey: proposalPubkey, isSigner: false, isWritable: true },
                    { pubkey: this.config.treasuryAddress, isSigner: false, isWritable: true }
                ],
                programId: this.config.programId,
                data: Buffer.from([2]) // Execute instruction
            })
        );

        return transaction;
    }

    async getProposal(proposalId: string): Promise<Proposal> {
        const proposalPubkey = new PublicKey(proposalId);
        const accountInfo = await this.connection.getAccountInfo(proposalPubkey);
        
        if (!accountInfo) {
            throw new GlitchError('Proposal not found');
        }

        // Deserialize account data into Proposal
        return this.deserializeProposal(accountInfo.data);
    }

    private deserializeProposal(data: Buffer): Proposal {
        // Implementation of proposal deserialization
        // This should match the on-chain account structure
        const decoder = new TextDecoder();
        
        let offset = 0;
        
        // Read fixed-length fields
        const id = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;
        
        const proposer = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        
        const titleLength = data.readUInt32LE(offset);
        offset += 4;
        const title = decoder.decode(data.slice(offset, offset + titleLength));
        offset += titleLength;
        
        const descLength = data.readUInt32LE(offset);
        offset += 4;
        const description = decoder.decode(data.slice(offset, offset + descLength));
        offset += descLength;
        
        const state = data.readUInt8(offset);
        offset += 1;
        
        const yesVotes = data.readBigUInt64LE(offset);
        offset += 8;
        
        const noVotes = data.readBigUInt64LE(offset);
        offset += 8;
        
        const startTime = Number(data.readBigUInt64LE(offset));
        offset += 8;
        
        const endTime = Number(data.readBigUInt64LE(offset));
        offset += 8;
        
        const executionTime = Number(data.readBigUInt64LE(offset));
        offset += 8;
        
        const treasury = new PublicKey(data.slice(offset, offset + 32));
        
        return {
            id,
            proposer,
            title,
            description,
            state: state as ProposalState,
            yesVotes: Number(yesVotes),
            noVotes: Number(noVotes),
            startTime,
            endTime,
            executionTime,
            treasury
        };
    }
}
