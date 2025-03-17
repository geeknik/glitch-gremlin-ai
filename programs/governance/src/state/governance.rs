use anchor_lang::prelude::*;

#[account]
pub struct GovernanceParams {
    pub min_stake_amount: u64,
    pub min_stake_duration: u64,
    pub min_proposal_stake: u64,
    pub proposal_delay: u64,
    pub voting_period: u64,
    pub quorum_percentage: u8,
    pub approval_threshold: u8,
    pub execution_delay: u64,
    pub grace_period: u64,
    pub treasury_fee_bps: u16,
    pub proposal_counter: u64,
    pub total_stake: u64,
    pub active_stake: u64,
    pub total_proposals: u64,
    pub active_proposals: u64,
}

impl Default for GovernanceParams {
    fn default() -> Self {
        Self {
            min_stake_amount: 1_000_000,
            min_stake_duration: 604_800, // 7 days
            min_proposal_stake: 5_000_000,
            proposal_delay: 86_400, // 1 day
            voting_period: 302_400, // 3.5 days
            quorum_percentage: 10,
            approval_threshold: 60,
            execution_delay: 86_400, // 1 day
            grace_period: 43_200, // 12 hours
            treasury_fee_bps: 100, // 1%
            proposal_counter: 0,
            total_stake: 0,
            active_stake: 0,
            total_proposals: 0,
            active_proposals: 0,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GovernanceConfig {
    pub min_stake_amount: u64,
    pub min_stake_duration: i64,
    pub min_proposal_stake: u64,
    pub voting_period: i64,
    pub quorum_percentage: u8,
    pub approval_threshold_percentage: u8,
    pub execution_delay: i64,
    pub proposal_delay: i64,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            min_stake_amount: 1_000_000,        // 1 GREMLINAI
            min_stake_duration: 2_592_000,      // 30 days
            min_proposal_stake: 5_000_000,      // 5 GREMLINAI
            voting_period: 604_800,             // 7 days
            quorum_percentage: 10,              // 10%
            approval_threshold_percentage: 60,   // 60%
            execution_delay: 86_400,            // 24 hours
            proposal_delay: 3600,               // 1 hour between proposals
        }
    }
}

impl GovernanceConfig {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.quorum_percentage > 0 && self.quorum_percentage <= 100,
            GovernanceError::InvalidQuorum
        );

        require!(
            self.approval_threshold_percentage > 0 && self.approval_threshold_percentage <= 100,
            GovernanceError::InvalidThreshold
        );

        require!(
            self.min_stake_amount > 0 &&
            self.min_proposal_stake >= self.min_stake_amount &&
            self.min_stake_duration > 0 &&
            self.voting_period > 0 &&
            self.execution_delay > 0 &&
            self.proposal_delay > 0,
            GovernanceError::InvalidGovernanceConfig
        );

        Ok(())
    }
} 
