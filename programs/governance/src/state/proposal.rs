use anchor_lang::prelude::*;
use super::ChaosParams;

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum ProposalState {
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ProposalType {
    ParameterChange,
    ChaosCampaign,
    TreasuryManagement,
    ProtocolUpgrade,
}

#[account]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub proposal_type: ProposalType,
    pub title: String,
    pub description: String,
    pub created_at: i64,
    pub voting_start: i64,
    pub voting_end: i64,
    pub execution_deadline: i64,
    pub execution_delay: i64,
    pub votes_for: u64,
    pub votes_against: u64,
    pub abstain_votes: u64,
    pub min_quorum: u64,
    pub staked_tokens: u64,
    pub status: ProposalStatus,
    pub executed: bool,
    pub execution_time: i64,
    pub action: Option<ProposalAction>,
    pub chaos_parameters: Option<ChaosParams>,
}

impl Proposal {
    pub fn calculate_vote_weight(&self, voting_power: u64, current_time: i64) -> Result<u64> {
        if current_time < self.voting_start || current_time > self.voting_end {
            return Err(GovernanceError::VotingPeriodClosed.into());
        }

        let remaining_duration = (self.voting_end - current_time) as f64;
        let total_duration = (self.voting_end - self.voting_start) as f64;
        let weight = (voting_power as f64 * (remaining_duration / total_duration).sqrt()) as u64;
        
        Ok(weight)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ProposalAction {
    UpdateConfig {
        min_stake_amount: Option<u64>,
        min_stake_duration: Option<u64>,
        min_proposal_stake: Option<u64>,
        proposal_delay: Option<u64>,
        voting_period: Option<u64>,
        quorum_percentage: Option<u8>,
        approval_threshold: Option<u8>,
        execution_delay: Option<u64>,
        grace_period: Option<u64>,
        treasury_fee_bps: Option<u16>,
    },
    ExecuteChaos {
        params: ChaosParams,
    },
    TransferFunds {
        amount: u64,
        destination: Pubkey,
    },
    EmergencyAction {
        action_type: u8, // 0=Halt, 1=Resume, 2=BlockAddress
        target: Option<Pubkey>,
    },
}

impl Proposal {
    pub fn space() -> usize {
        8 +  // discriminator
        1 +  // is_initialized
        32 + // proposer
        100 + // title (max length)
        500 + // description (max length)
        8 +  // created_at
        8 +  // voting_starts_at
        8 +  // voting_ends_at
        9 +  // execution_time (Option)
        9 +  // executed_at (Option)
        9 +  // canceled_at (Option)
        8 +  // yes_votes
        8 +  // no_votes
        8 +  // abstain_votes
        1 +  // state
        1 +  // status
        1 +  // action
        1 +  // voting_state
        200 + // metadata (approximate)
        8 +  // total_stake_snapshot
        200 + // chaos_params (approximate)
        1 +  // quorum_achieved
        1    // threshold_achieved
    }

    pub fn validate_new(
        &self,
        clock: &Clock,
        config: &crate::state::governance::GovernanceConfig,
    ) -> Result<()> {
        require!(
            self.voting_ends_at > clock.unix_timestamp,
            GovernanceError::InvalidVotingPeriod
        );

        require!(
            self.voting_ends_at - clock.unix_timestamp >= config.voting_period,
            GovernanceError::InvalidVotingPeriod
        );

        require!(
            self.execution_delay >= config.execution_delay,
            GovernanceError::TimelockBypass
        );

        self.chaos_params.validate()?;

        Ok(())
    }

    pub fn can_vote(&self, clock: &Clock) -> Result<()> {
        require!(
            self.state == ProposalState::Active,
            GovernanceError::InvalidProposalState
        );

        require!(
            clock.unix_timestamp < self.voting_ends_at,
            GovernanceError::VotingPeriodEnded
        );

        Ok(())
    }

    pub fn process_vote(
        &mut self,
        vote_weight: u64,
        vote_yes: bool,
    ) -> Result<()> {
        if vote_yes {
            self.yes_votes = self.yes_votes.checked_add(vote_weight)
                .ok_or(GovernanceError::ArithmeticError)?;
        } else {
            self.no_votes = self.no_votes.checked_add(vote_weight)
                .ok_or(GovernanceError::ArithmeticError)?;
        }

        Ok(())
    }

    pub fn finalize_vote(
        &mut self,
        quorum_votes: u64,
        threshold_votes: u64,
    ) -> Result<()> {
        let total_votes = self.yes_votes
            .checked_add(self.no_votes)
            .ok_or(GovernanceError::ArithmeticError)?;

        self.quorum_achieved = total_votes >= quorum_votes;
        self.threshold_achieved = self.yes_votes >= threshold_votes;

        self.state = if self.quorum_achieved && self.threshold_achieved {
            ProposalState::Succeeded
        } else {
            ProposalState::Defeated
        };

        Ok(())
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
