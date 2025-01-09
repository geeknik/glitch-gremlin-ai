import { Connection } from '@solana/web3.js';

export class GovernanceService {
    constructor(connection) {
        this.connection = connection;
    }

    async getActiveProposals() {
        try {
            const proposals = await this.connection.getProgramAccounts(
                // TODO: Replace with actual governance program ID
                "GremLinXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            );
            
            return proposals.map(({ account }) => {
                const decoded = this.decodeProposalData(account.data);
                return {
                    id: decoded.id,
                    title: decoded.title,
                    description: decoded.description,
                    votesYes: decoded.yes_votes,
                    votesNo: decoded.no_votes,
                    status: this.getProposalStatus(decoded.status),
                    endTime: decoded.end_time,
                    progress: this.calculateProgress(decoded.yes_votes, decoded.no_votes)
                };
            });
        } catch (error) {
            console.error('Failed to fetch proposals:', error);
            return [];
        }
    }

    decodeProposalData(data) {
        // TODO: Implement actual Borsh deserialization
        return {
            id: 0,
            title: "",
            description: "",
            yes_votes: 0,
            no_votes: 0,
            status: 0,
            end_time: Date.now() + 86400000 // 24h from now
        };
    }

    getProposalStatus(status) {
        const statuses = ['active', 'passed', 'failed', 'executed'];
        return statuses[status] || 'unknown';
    }

    calculateProgress(yes, no) {
        const total = yes + no;
        return total > 0 ? (yes / total) * 100 : 0;
    }

    async vote(proposalId, support) {
        // TODO: Implement actual voting transaction
        console.log(`Voting ${support ? 'yes' : 'no'} on proposal ${proposalId}`);
    }
}
