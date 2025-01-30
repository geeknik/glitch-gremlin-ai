use {
    anchor_lang::prelude::*,
    solana_program::pubkey::Pubkey,
    std::collections::HashMap,
    super::proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    crate::error::GovernanceError,
};

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct GovernanceParams {
    pub min_stake_to_propose: u64,
    pub min_stake_to_vote: u64,
    pub voting_delay: i64,
    pub voting_period: i64,
    pub quorum_votes: u64,
    pub timelock_delay: i64,
    pub proposal_threshold: u64,
    pub vote_threshold: u64,
    pub min_stake_amount: u64,
    pub stake_lockup_duration: i64,
    pub execution_delay: i64,
    pub min_proposal_stake: u64,
}

impl Default for GovernanceParams {
    fn default() -> Self {
        Self {
            min_stake_to_propose: 1000,
            min_stake_to_vote: 100,
            voting_delay: 0,
            voting_period: 302400, // ~3.5 days
            quorum_votes: 4_000_000,
            timelock_delay: 172800, // 2 days
            proposal_threshold: 100_000,
            vote_threshold: 400_000,
            min_stake_amount: 1_000_000,
            stake_lockup_duration: 604_800, // 7 days
            execution_delay: 86_400, // 1 day
            min_proposal_stake: 10_000_000,
        }
    }
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalMetadata {
    pub title: String,
    pub description: String,
    pub link: Option<String>,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalVotingState {
    pub yes_votes: u64,
    pub no_votes: u64,
    pub abstain_votes: u64,
    pub vote_records: HashMap<Pubkey, VoteRecord>,
    pub quorum_reached: bool,
    pub vote_end_time: i64,
}

impl ProposalVotingState {
    pub fn new(vote_end_time: i64) -> Self {
        Self {
            yes_votes: 0,
            no_votes: 0,
            abstain_votes: 0,
            vote_records: HashMap::new(),
            quorum_reached: false,
            vote_end_time,
        }
    }

    pub fn add_vote(&mut self, vote_record: VoteRecord) -> Result<()> {
        if self.vote_records.contains_key(&vote_record.voter) {
            return Err(error!(GovernanceError::AlreadyVoted));
        }

        if vote_record.vote {
            self.yes_votes = self.yes_votes.checked_add(vote_record.stake_weight)
                .ok_or_else(|| error!(GovernanceError::ArithmeticOverflow))?;
        } else {
            self.no_votes = self.no_votes.checked_add(vote_record.stake_weight)
                .ok_or_else(|| error!(GovernanceError::ArithmeticOverflow))?;
        }

        self.vote_records.insert(vote_record.voter, vote_record);
        Ok(())
    }

    pub fn remove_vote(&mut self, voter: &Pubkey) -> Result<()> {
        let vote_record = self.vote_records.remove(voter)
            .ok_or_else(|| error!(GovernanceError::VoteNotFound))?;

        if vote_record.vote {
            self.yes_votes = self.yes_votes.checked_sub(vote_record.stake_weight)
                .ok_or_else(|| error!(GovernanceError::ArithmeticUnderflow))?;
        } else {
            self.no_votes = self.no_votes.checked_sub(vote_record.stake_weight)
                .ok_or_else(|| error!(GovernanceError::ArithmeticUnderflow))?;
        }

        Ok(())
    }

    pub fn has_quorum(&self, quorum_votes: u64) -> bool {
        self.yes_votes.checked_add(self.no_votes)
            .map(|total| total >= quorum_votes)
            .unwrap_or(false)
    }

    pub fn has_passed(&self, vote_threshold: u64) -> bool {
        self.yes_votes >= vote_threshold
    }
} 