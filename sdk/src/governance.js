import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
export var ProposalState;
(function (ProposalState) {
    ProposalState["Draft"] = "Draft";
    ProposalState["Active"] = "Active";
    ProposalState["Succeeded"] = "Succeeded";
    ProposalState["Defeated"] = "Defeated";
    ProposalState["Executed"] = "Executed";
    ProposalState["Cancelled"] = "Cancelled";
})(ProposalState || (ProposalState = {}));
export class GovernanceManager {
    constructor(connection, programId = new PublicKey('Governance111111111111111111111111111111111'), config) {
        this.connection = connection;
        this.programId = programId;
        this.config = config;
    }
    async createProposal(params) {
        return this.createProposalAccount(this.connection, Keypair.generate(), params);
    }
    async vote(proposalAddress, vote) {
        return this.castVote(this.connection, Keypair.generate(), proposalAddress, vote);
    }
    async getProposal(proposalAddress) {
        return this.validateProposal(this.connection, proposalAddress);
    }
    async getProposals() {
        // Implementation would fetch multiple proposals
        return [];
    }
    async getDelegatedBalance(connection, wallet) {
        // Get delegated voting power from governance accounts
        const delegateAccounts = await connection.getProgramAccounts(this.programId, {
            filters: [
                { dataSize: 128 }, // Expected size of delegate account
                { memcmp: { offset: 32, bytes: wallet.toBase58() } }
            ]
        });
        return delegateAccounts.reduce((total, account) => total + (account.account.lamports || 0), 0);
    }
    async calculateVoteWeight(connection, wallet) {
        // Get direct balance
        const accountInfo = await connection.getAccountInfo(wallet);
        const directBalance = accountInfo ? accountInfo.lamports : 0;
        // Get delegated balance
        const delegatedBalance = await this.getDelegatedBalance(connection, wallet);
        // Combine direct and delegated voting power
        const totalPower = directBalance + delegatedBalance;
        return Math.max(0, totalPower / 1000000); // Convert to voting units
    }
    async getProposalState(connection, proposalAddress) {
        const accountInfo = await connection.getAccountInfo(proposalAddress);
        if (!accountInfo) {
            throw new Error('Proposal not found');
        }
        // Fixed field sizes based on account layout
        const TITLE_LEN = 64;
        const DESC_LEN = 256;
        const PUBKEY_LEN = 32;
        const TIMESTAMP_LEN = 8;
        const U32_LEN = 4;
        const U8_LEN = 1;
        const U16_LEN = 2;
        // Calculate minimum required buffer size for fixed fields
        const MIN_BUFFER_SIZE = TITLE_LEN + DESC_LEN + PUBKEY_LEN +
            (3 * TIMESTAMP_LEN) +
            (3 * U32_LEN) +
            (2 * U8_LEN) + U16_LEN;
        const data = accountInfo.data;
        if (data.length < MIN_BUFFER_SIZE) {
            throw new Error(`Invalid buffer size: ${data.length}. Minimum required: ${MIN_BUFFER_SIZE}`);
        }
        let offset = 0;
        // Read fixed-length title (64 bytes)
        const title = data.slice(offset, offset + TITLE_LEN).toString('utf8').replace(/\0+$/, '');
        offset += TITLE_LEN;
        // Read fixed-length description (256 bytes)
        const description = data.slice(offset, offset + DESC_LEN).toString('utf8').replace(/\0+$/, '');
        offset += DESC_LEN;
        // Read proposer public key (32 bytes)
        const proposer = new PublicKey(data.slice(offset, offset + PUBKEY_LEN));
        offset += PUBKEY_LEN;
        // Read timestamps (8 bytes each, BigInt64LE)
        let startTime, endTime, timeLockEnd;
        try {
            startTime = Number(data.readBigInt64LE(offset));
            offset += TIMESTAMP_LEN;
            endTime = Number(data.readBigInt64LE(offset));
            offset += TIMESTAMP_LEN;
            timeLockEnd = Number(data.readBigInt64LE(offset));
            offset += TIMESTAMP_LEN;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to read timestamps: ${errorMessage}. Buffer might be malformed.`);
        }
        // Read vote counts (4 bytes each, UInt32LE)
        const yesVotes = data.readUInt32LE(offset);
        offset += U32_LEN;
        const noVotes = data.readUInt32LE(offset);
        offset += U32_LEN;
        const quorumRequired = data.readUInt32LE(offset);
        offset += U32_LEN;
        // Read flags (1 byte each, UInt8)
        const executed = data.readUInt8(offset) === 1;
        offset += U8_LEN;
        const state = data.readUInt8(offset);
        offset += U8_LEN;
        // Read votes array length (2 bytes, UInt16LE)
        let votesLen;
        // Declare votes array outside try block so it's accessible in return statement
        const votes = [];
        try {
            votesLen = data.readUInt16LE(offset);
            offset += U16_LEN;
            // Validate that buffer has enough space for votes array
            if (offset + (votesLen * PUBKEY_LEN) > data.length) {
                throw new Error('Buffer too small for votes array');
            }
            // Populate the votes array
            for (let i = 0; i < votesLen; i++) {
                votes.push(new PublicKey(data.slice(offset, offset + PUBKEY_LEN)));
                offset += PUBKEY_LEN;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`Vote parsing warning: ${errorMessage}`);
            // Return empty votes array instead of throwing
            votes.length = 0;
        }
        return {
            title,
            description,
            proposer,
            startTime: Number(startTime),
            endTime: Number(endTime),
            timeLockEnd: Number(timeLockEnd),
            yesVotes,
            noVotes,
            quorumRequired,
            executed,
            status: (() => {
                const stateMap = {
                    0: ProposalState.Draft,
                    1: ProposalState.Active,
                    2: ProposalState.Succeeded,
                    3: ProposalState.Defeated,
                    4: ProposalState.Executed,
                    5: ProposalState.Cancelled
                };
                return stateMap[state].toString() || ProposalState.Draft.toString();
            })(),
            state: (() => {
                const stateMap = {
                    0: ProposalState.Draft,
                    1: ProposalState.Active,
                    2: ProposalState.Succeeded,
                    3: ProposalState.Defeated,
                    4: ProposalState.Executed,
                    5: ProposalState.Cancelled
                };
                return stateMap[state] || ProposalState.Draft;
            })(),
            votes
        };
    }
    async hasVoted(connection, proposalAddress, voter) {
        // Check proposal state and voter record
        const proposalState = await this.getProposalState(connection, proposalAddress);
        return proposalState.votes?.some(vote => vote.toString() === voter.toString()) || false;
    }
    async getVoteCount(connection, proposalAddress) {
        const proposalState = await this.getProposalState(connection, proposalAddress);
        return {
            yes: proposalState.yesVotes,
            no: proposalState.noVotes,
            abstain: 0
        };
    }
    async validateProposal(connection, proposalAddress) {
        const proposalState = await this.getProposalState(connection, proposalAddress);
        return {
            title: proposalState.title || '',
            description: proposalState.description || '',
            proposer: proposalState.proposer,
            startTime: proposalState.startTime,
            endTime: proposalState.endTime,
            executionTime: proposalState.timeLockEnd,
            voteWeights: {
                yes: proposalState.yesVotes,
                no: proposalState.noVotes,
                abstain: 0,
            },
            votes: [],
            quorum: proposalState.quorumRequired,
            executed: proposalState.executed,
            status: proposalState.state,
        };
    }
    async castVote(connection, wallet, proposalAddress, vote) {
        // Get proposal state
        const proposalState = await this.getProposalState(connection, proposalAddress);
        // Validate proposal exists and is active
        if (!proposalState) {
            throw new Error('Proposal not found');
        }
        // Check proposal state and voting period
        if (proposalState.endTime < Date.now()) {
            throw new Error('Voting period has ended');
        }
        else if (proposalState.state !== ProposalState.Active) {
            throw new Error('Proposal is not in voting state');
        }
        // Check if voter has already voted
        const hasVoted = await this.hasVoted(connection, proposalAddress, wallet.publicKey);
        if (hasVoted) {
            throw new Error('Already voted');
        }
        // Check voting power including delegations
        const votingPower = await this.calculateVoteWeight(connection, wallet.publicKey);
        const minVotingPower = 1; // Minimum voting power required
        if (votingPower <= minVotingPower) {
            throw new Error('Insufficient voting power');
        }
        // Validate proposal is still active and not expired
        if (proposalState.endTime < Date.now()) {
            throw new Error('Voting period has ended');
        }
        const transaction = new Transaction();
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalAddress, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false }
            ],
            programId: this.programId,
            data: Buffer.from([vote ? 1 : 0]) // Vote instruction data
        });
        transaction.add(instruction);
        return transaction;
    }
    async createProposalAccount(connection, wallet, params) {
        // Validate required parameters
        if (!params.title?.trim() || !params.description?.trim() || !params.votingPeriod || params.votingPeriod <= 0) {
            throw new Error('Invalid proposal parameters');
        }
        const proposalKeypair = Keypair.generate();
        const proposalAddress = proposalKeypair.publicKey;
        const transaction = new Transaction();
        transaction.add(new TransactionInstruction({
            keys: [
                { pubkey: proposalAddress, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false }
            ],
            programId: this.programId,
            data: Buffer.from([]) // Create proposal instruction data
        }));
        return { proposalAddress, tx: transaction };
    }
    async executeProposal(connection, wallet, proposalAddress) {
        // Get current proposal state
        const proposalState = await this.getProposalState(connection, proposalAddress);
        // First check if proposal exists
        if (!proposalState) {
            throw new Error('Cannot execute: Proposal not found');
        }
        // Check quorum requirements first
        const voteCount = await this.getVoteCount(connection, proposalAddress);
        if (voteCount.yes < proposalState.quorumRequired) {
            throw new Error('Proposal has not reached quorum');
        }
        // Then check proposal state
        if (proposalState.state !== ProposalState.Succeeded) {
            throw new Error('Cannot execute: Proposal is not in succeeded state');
        }
        // Check if already executed
        if (proposalState.executed) {
            throw new Error('Cannot execute: Proposal has already been executed');
        }
        // Finally verify timelock period
        if (proposalState.timeLockEnd > Date.now()) {
            throw new Error('Timelock period not elapsed');
        }
        // Create transaction
        const transaction = new Transaction();
        // Add execute instruction
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalAddress, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false }
            ],
            programId: this.programId,
            data: Buffer.from([]) // Execution instruction data
        });
        transaction.add(instruction);
        return transaction;
    }
}
