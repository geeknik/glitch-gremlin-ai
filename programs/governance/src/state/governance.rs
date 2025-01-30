use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;
use std::collections::HashMap;

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
        }
    }
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum ProposalAction {
    UpgradeProgram {
        program_id: Pubkey,
        buffer: Pubkey,
    },
    ModifyParams {
        param_name: String,
        new_value: u64,
    },
    TransferTokens {
        token_mint: Pubkey,
        recipient: Pubkey,
        amount: u64,
    },
    Custom {
        instruction_data: Vec<u8>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum ProposalStatus {
    Draft,
    Active,
    Canceled,
    Defeated,
    Succeeded,
    Queued,
    Expired,
    Executed,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalMetadata {
    pub title: String,
    pub description: String,
    pub link: Option<String>,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub side: bool,
    pub voting_power: u64,
    pub timestamp: i64,
}

impl VoteRecord {
    pub fn new(
        voter: Pubkey,
        proposal: Pubkey,
        side: bool,
        voting_power: u64,
        timestamp: i64,
    ) -> Self {
        Self {
            voter,
            proposal,
            side,
            voting_power,
            timestamp,
        }
    }
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
            return Err(error!(ErrorCode::AlreadyVoted));
        }

        if vote_record.side {
            self.yes_votes = self.yes_votes.checked_add(vote_record.voting_power)
                .ok_or(ErrorCode::ArithmeticError)?;
        } else {
            self.no_votes = self.no_votes.checked_add(vote_record.voting_power)
                .ok_or(ErrorCode::ArithmeticError)?;
        }

        self.vote_records.insert(vote_record.voter, vote_record);
        Ok(())
    }

    pub fn remove_vote(&mut self, voter: &Pubkey) -> Result<()> {
        let vote_record = self.vote_records.remove(voter)
            .ok_or(ErrorCode::VoteNotFound)?;

        if vote_record.side {
            self.yes_votes = self.yes_votes.checked_sub(vote_record.voting_power)
                .ok_or(ErrorCode::ArithmeticError)?;
        } else {
            self.no_votes = self.no_votes.checked_sub(vote_record.voting_power)
                .ok_or(ErrorCode::ArithmeticError)?;
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