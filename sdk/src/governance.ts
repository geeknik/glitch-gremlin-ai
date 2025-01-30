import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { GlitchError, ErrorCode } from './errors.js';
import { 
    ProposalState, 
    ProposalData, 
    VoteRecord, 
    DelegationRecord,
    VoteWeight,
    ChaosRequestParams,
    GovernanceConfig
} from './types.js';

declare global {
    interface Window {
        security?: {
            mutation?: {
                test?: (params: any) => Promise<any>;
            };
        };
    }
}

export interface IGovernanceManager {
    connection: Connection;
    wallet: any; // Replace with proper wallet type
    config: Required<GovernanceConfig>;
    validateProposal(connection: Connection, proposalAddress: PublicKey): Promise<ProposalData>;
    createProposalInstruction(params: {
        proposer: PublicKey;
        title: string;
        description: string;
        stakingAmount: number;
        testParams: ChaosRequestParams;
    }): Promise<TransactionInstruction>;
    createProposal(title: string, description: string, stakingAmount: number): Promise<{ proposalId: string; signature: string; }>;
    vote(proposalId: string, vote: 'yes' | 'no' | 'abstain'): Promise<string>;
    execute(proposalId: string): Promise<string>;
    cancel(proposalId: string): Promise<string>;
    getVoteRecord(voteRecordAddress: PublicKey): Promise<VoteRecord>;
    getVoteRecords(proposalId: string): Promise<VoteRecord[]>;
    getProposals(): Promise<ProposalData[]>;
    getVotingPower(voter: PublicKey): Promise<number>;
    getDelegation(delegator: PublicKey, delegate: PublicKey): Promise<DelegationRecord | null>;
    getDelegatedBalance(delegator: PublicKey): Promise<number>;
    calculateVoteWeight(voter: PublicKey, proposalId: string): Promise<VoteWeight>;
    getProposalState(proposalId: string): Promise<ProposalState>;
    getProposalData(proposalAddress: PublicKey): Promise<ProposalData>;
}

export class BaseGovernanceManager implements IGovernanceManager {
    public readonly connection: Connection;
    public readonly wallet: any; // Replace with proper wallet type
    public readonly config: Required<GovernanceConfig>;

    constructor(connection: Connection, wallet: Keypair, config: Required<GovernanceConfig>) {
        this.connection = connection;
        this.wallet = wallet;
        this.config = config;

        // Validate configuration
        if (!config.programId) {
            throw new Error('Program ID is required');
        }
        if (!config.minStakeAmount || config.minStakeAmount <= 0) {
            throw new Error('Invalid minimum stake amount');
        }
        if (!config.votingPeriod || config.votingPeriod < 60) {
            throw new Error('Invalid voting period');
        }
        if (!config.quorum || config.quorum <= 0 || config.quorum > 100) {
            throw new Error('Invalid quorum percentage');
        }
    }

    public async validateProposal(connection: Connection, proposalAddress: PublicKey): Promise<ProposalData> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async createProposalInstruction(params: {
        proposer: PublicKey;
        title: string;
        description: string;
        stakingAmount: number;
        testParams: ChaosRequestParams;
    }): Promise<TransactionInstruction> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async createProposal(title: string, description: string, stakingAmount: number): Promise<{ proposalId: string; signature: string; }> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async vote(proposalId: string, vote: 'yes' | 'no' | 'abstain'): Promise<string> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async execute(proposalId: string): Promise<string> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async cancel(proposalId: string): Promise<string> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async getVoteRecord(voteRecordAddress: PublicKey): Promise<VoteRecord> {
        const accountInfo = await this.connection.getAccountInfo(voteRecordAddress);
        if (!accountInfo) {
            throw new Error('Vote record account not found');
        }
        // Implement the actual deserialization logic here
        return {
            proposal: PublicKey.default,
            voter: PublicKey.default,
            vote: 'abstain',
            weight: 0,
            timestamp: Date.now()
        };
    }

    public async getVoteRecords(proposalId: string): Promise<VoteRecord[]> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async getProposals(): Promise<ProposalData[]> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async getVotingPower(voter: PublicKey): Promise<number> {
        const voteWeight = await this.calculateVoteWeight(voter, '');
        return voteWeight.total;
    }

    public async getDelegation(delegator: PublicKey, delegate: PublicKey): Promise<DelegationRecord | null> {
        throw new GlitchError('Not implemented', ErrorCode.NOT_IMPLEMENTED);
    }

    public async getDelegatedBalance(delegator: PublicKey): Promise<number> {
        // Get delegated voting power from governance accounts
        const delegateAccounts = await this.connection.getProgramAccounts(this.config.programId, {
            filters: [
                { dataSize: 128 }, // Expected size of delegate account
                { memcmp: { offset: 32, bytes: delegator.toBase58() } }
            ]
        });
        return delegateAccounts.reduce((total, account) =>
            total + (account.account.lamports || 0), 0);
    }

    public async calculateVoteWeight(voter: PublicKey, proposalId: string): Promise<VoteWeight> {
        // Get direct balance
        const accountInfo = await this.connection.getAccountInfo(voter);
        const baseStake = accountInfo ? accountInfo.lamports : 0;

        // Get delegated balance
        const delegatedPower = await this.getDelegatedBalance(voter);

        // Check for SPOOGE token bonus
        const hasSpoogeBonus = await this.checkSpoogeBonus(voter);

        // Calculate total with bonuses
        const spoogeMultiplier = hasSpoogeBonus ? 2 : 1;
        const total = (baseStake * spoogeMultiplier) + delegatedPower;

        return {
            total,
            baseStake,
            hasSpoogeBonus,
            delegatedPower
        };
    }

    private async checkSpoogeBonus(voter: PublicKey): Promise<boolean> {
        try {
            // TODO: Implement actual SPOOGE token balance check
            return false;
        } catch (error) {
            console.error('Failed to check SPOOGE bonus:', error);
            return false;
        }
    }

    public async getProposalState(proposalId: string): Promise<ProposalState> {
        const proposal = await this.getProposalData(new PublicKey(proposalId));
        return this.getProposalStateFromData(proposal);
    }

    private getProposalStateFromData(proposal: ProposalData): ProposalState {
        const now = Date.now();
        if (!proposal.executed && now < proposal.startTime) {
            return ProposalState.Draft;
        }
        if (!proposal.executed && now >= proposal.startTime && now <= proposal.endTime) {
            return ProposalState.Active;
        }
        if (proposal.executed) {
            return ProposalState.Executed;
        }
        if (proposal.voteWeights.yes > proposal.voteWeights.no && proposal.voteWeights.yes >= proposal.quorum) {
            return ProposalState.Succeeded;
        }
        if (now > proposal.endTime) {
            return ProposalState.Failed;
        }
        return ProposalState.Cancelled;
    }

    public async getProposalData(proposalAddress: PublicKey): Promise<ProposalData> {
        const accountInfo = await this.connection.getAccountInfo(proposalAddress);
        if (!accountInfo) {
            throw new Error('Proposal account not found');
        }
        // Implement the actual deserialization logic here
        const proposal = {
            title: '',
            description: '',
            proposer: PublicKey.default,
            startTime: 0,
            endTime: 0,
            executionTime: 0,
            voteWeights: {
                yes: 0,
                no: 0,
                abstain: 0
            },
            votes: [],
            quorum: 0,
            executed: false,
            state: ProposalState.Draft
        };
        proposal.state = this.getProposalStateFromData(proposal);
        return proposal;
    }

    async hasVoted(proposalAddress: PublicKey, voter: PublicKey): Promise<boolean> {
        const proposal = await this.getProposalData(proposalAddress);
        return proposal.votes.some(vote => vote.toString() === voter.toString());
    }

    async getVoteCounts(proposalAddress: PublicKey): Promise<{yes: number, no: number, abstain: number}> {
        const proposal = await this.getProposalData(proposalAddress);
        return proposal.voteWeights;
    }

    async getDelegationRecord(delegationRecordAddress: PublicKey): Promise<DelegationRecord> {
        const accountInfo = await this.connection.getAccountInfo(delegationRecordAddress);
        if (!accountInfo) {
            throw new Error('Delegation record account not found');
        }
        // Implement the actual deserialization logic here
        return {
            delegator: PublicKey.default,
            delegate: PublicKey.default,
            amount: 0,
            timestamp: Date.now()
        };
    }

    async processVote(vote: 'yes' | 'no' | 'abstain', proposalAddress: PublicKey, voter: PublicKey): Promise<void> {
        const proposal = await this.getProposalData(proposalAddress);
        if (proposal.state !== ProposalState.Active) {
            throw new Error('Proposal is not in active state');
        }
        if (await this.hasVoted(proposalAddress, voter)) {
            throw new Error('Voter has already voted on this proposal');
        }

        const transaction = new Transaction();
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalAddress, isSigner: false, isWritable: true },
                { pubkey: voter, isSigner: true, isWritable: false }
            ],
            programId: this.config.programId,
            data: Buffer.from([vote === 'yes' ? 1 : vote === 'no' ? 2 : 3]) // Vote instruction data
        });
        transaction.add(instruction);
        await this.connection.sendTransaction(transaction, [this.wallet]);
    }

    async executeProposal(proposalAddress: PublicKey): Promise<void> {
        const proposal = await this.getProposalData(proposalAddress);
        if (proposal.state !== ProposalState.Succeeded) {
            throw new Error('Proposal is not in succeeded state');
        }
        if (proposal.executed) {
            throw new Error('Proposal has already been executed');
        }
        if (Date.now() < proposal.executionTime) {
            throw new Error('Execution time has not been reached');
        }

        const transaction = new Transaction();
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalAddress, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false }
            ],
            programId: this.config.programId,
            data: Buffer.from([4]) // Execute instruction data
        });
        transaction.add(instruction);
        await this.connection.sendTransaction(transaction, [this.wallet]);
    }

    async cancelProposal(proposalAddress: PublicKey): Promise<void> {
        const proposal = await this.getProposalData(proposalAddress);
        if (proposal.state !== ProposalState.Draft && proposal.state !== ProposalState.Active) {
            throw new Error('Proposal can only be cancelled in draft or active state');
        }

        const transaction = new Transaction();
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalAddress, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false }
            ],
            programId: this.config.programId,
            data: Buffer.from([5]) // Cancel instruction data
        });
        transaction.add(instruction);
        await this.connection.sendTransaction(transaction, [this.wallet]);
    }
}

export { IGovernanceManager as GovernanceManager };
