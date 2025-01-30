use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GovernanceParams {
    pub min_stake_to_propose: u64,
    pub min_stake_to_vote: u64,
    pub min_voting_period: i64,
    pub max_voting_period: i64,
    pub quorum_percentage: u8,
    pub approval_threshold_percentage: u8,
    pub proposal_rate_limit: u64,
    pub proposal_rate_window: i64,
}

impl Default for GovernanceParams {
    fn default() -> Self {
        Self {
            min_stake_to_propose: 1_000_000_000, // 1 SOL
            min_stake_to_vote: 100_000_000,      // 0.1 SOL
            min_voting_period: 24 * 60 * 60,     // 1 day
            max_voting_period: 7 * 24 * 60 * 60, // 7 days
            quorum_percentage: 10,               // 10%
            approval_threshold_percentage: 60,    // 60%
            proposal_rate_limit: 5,              // 5 proposals
            proposal_rate_window: 24 * 60 * 60,  // per day
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ProposalAction {
    UpdateGovernanceParams(GovernanceParams),
    UpdateAuthority(Pubkey),
    UpdateTreasuryAuthority(Pubkey),
    EmergencyHalt,
    ResumeOperation,
    Custom(Vec<u8>),
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProposalMetadata {
    pub title: String,
    pub description: String,
    pub link: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub vote_weight: u64,
    pub side: bool, // true for yes, false for no
    pub timestamp: i64,
}

impl VoteRecord {
    pub fn new(voter: Pubkey, proposal: Pubkey, vote_weight: u64, side: bool, timestamp: i64) -> Self {
        Self {
            voter,
            proposal,
            vote_weight,
            side,
            timestamp,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProposalVotingState {
    pub yes_votes: u64,
    pub no_votes: u64,
    pub abstain_votes: u64,
    pub total_eligible_votes: u64,
    pub quorum_achieved: bool,
    pub vote_end_time: i64,
}

impl ProposalVotingState {
    pub fn new(total_eligible_votes: u64, vote_end_time: i64) -> Self {
        Self {
            yes_votes: 0,
            no_votes: 0,
            abstain_votes: 0,
            total_eligible_votes,
            quorum_achieved: false,
            vote_end_time,
        }
    }

    pub fn add_vote(&mut self, weight: u64, side: bool) {
        if side {
            self.yes_votes = self.yes_votes.saturating_add(weight);
        } else {
            self.no_votes = self.no_votes.saturating_add(weight);
        }
    }

    pub fn remove_vote(&mut self, weight: u64, side: bool) {
        if side {
            self.yes_votes = self.yes_votes.saturating_sub(weight);
        } else {
            self.no_votes = self.no_votes.saturating_sub(weight);
        }
    }

    pub fn total_votes_cast(&self) -> u64 {
        self.yes_votes.saturating_add(self.no_votes).saturating_add(self.abstain_votes)
    }

    pub fn has_reached_quorum(&self, quorum_percentage: u8) -> bool {
        let quorum_threshold = (self.total_eligible_votes as u128)
            .saturating_mul(quorum_percentage as u128)
            .saturating_div(100)
            as u64;
        self.total_votes_cast() >= quorum_threshold
    }

    pub fn has_passed(&self, approval_threshold_percentage: u8) -> bool {
        if self.total_votes_cast() == 0 {
            return false;
        }

        let total_decisive_votes = self.yes_votes.saturating_add(self.no_votes);
        if total_decisive_votes == 0 {
            return false;
        }

        let approval_threshold = (total_decisive_votes as u128)
            .saturating_mul(approval_threshold_percentage as u128)
            .saturating_div(100)
            as u64;

        self.yes_votes >= approval_threshold
    }
} 