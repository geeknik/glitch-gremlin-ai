use {
    anchor_lang::prelude::*,
    std::collections::HashMap,
};

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub vote: bool,
    pub stake_weight: u64,
    pub voted_at: i64,
}

impl VoteRecord {
    pub fn new(
        voter: Pubkey,
        vote: bool,
        stake_weight: u64,
        voted_at: i64,
    ) -> Self {
        Self {
            voter,
            vote,
            stake_weight,
            voted_at,
        }
    }
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Proposal {
    pub proposer: Pubkey,
    pub description: String,
    pub link: Option<String>,
    pub created_at: i64,
    pub voting_ends_at: i64,
    pub executed_at: Option<i64>,
    pub canceled_at: Option<i64>,
    pub execution_delay: u64,
    pub for_votes: u64,
    pub against_votes: u64,
    pub status: ProposalStatus,
    pub action: ProposalAction,
    pub votes: HashMap<Pubkey, VoteRecord>,
    pub quorum_achieved: bool,
    pub threshold_achieved: bool,
}

impl Proposal {
    pub fn new(
        proposer: Pubkey,
        description: String,
        link: Option<String>,
        execution_delay: u64,
        action: ProposalAction,
        voting_ends_at: i64,
    ) -> Self {
        let now = Clock::get().unwrap().unix_timestamp;
        Self {
            proposer,
            description,
            link,
            created_at: now,
            voting_ends_at,
            executed_at: None,
            canceled_at: None,
            execution_delay,
            for_votes: 0,
            against_votes: 0,
            status: ProposalStatus::Draft,
            action,
            votes: HashMap::new(),
            quorum_achieved: false,
            threshold_achieved: false,
        }
    }

    pub fn is_active(&self) -> bool {
        matches!(self.status, ProposalStatus::Active)
    }

    pub fn can_execute(&self) -> bool {
        matches!(self.status, ProposalStatus::Succeeded) && 
        !matches!(self.status, ProposalStatus::Executed) &&
        self.quorum_achieved && 
        self.threshold_achieved
    }

    pub fn total_votes(&self) -> u64 {
        self.for_votes.saturating_add(self.against_votes)
    }

    pub fn approval_percentage(&self) -> u8 {
        let total = self.total_votes();
        if total == 0 {
            return 0;
        }
        ((self.for_votes as f64 / total as f64) * 100.0) as u8
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Defeated,
    Executed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum ProposalAction {
    UpdateParams {
        min_stake: u64,
        min_quorum: u8,
        min_threshold: u8,
        min_voting_period: i64,
        max_voting_period: i64,
    },
    UpdateAuthority {
        new_authority: Pubkey,
    },
    EmergencyHalt {
        halt: bool,
    },
    Custom {
        data: [u8; 32],
    },
} 