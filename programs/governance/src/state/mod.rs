use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    program_pack::IsInitialized,
    pubkey::Pubkey,
};
use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct Proposal {
    pub is_initialized: bool,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub created_at: i64,
    pub start_time: i64,
    pub end_time: i64,
    pub execution_time: Option<i64>,
    pub executed_at: Option<i64>,
    pub canceled_at: Option<i64>,
    pub total_votes_count: u32,
    pub approved_votes_count: u32,
    pub rejected_votes_count: u32,
    pub quorum_percentage: u8,
    pub approval_threshold_percentage: u8,
    pub execution_delay: i64,
    pub chaos_params: ChaosParams,
    pub state: ProposalState,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub executed: bool,
    pub total_stake_snapshot: u64,
    pub unique_voters: u32,
    pub stake_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub amount: u64,
    pub support: bool,
    pub timestamp: i64,
    pub voting_power: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ChaosParams {
    pub requires_funding: bool,
    pub treasury_amount: u64,
    pub target_program: Pubkey,
    pub max_duration: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ProposalState {
    Draft,
    Active,
    Canceled,
    Succeeded,
    Failed,
    Executed,
}

impl IsInitialized for Proposal {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

#[account]
#[derive(Debug)]
pub struct GovernanceConfig {
    pub min_proposal_stake: u64,
    pub proposal_rate_limit: u64,
    pub vote_threshold: u64,
    pub min_voting_period: i64,
    pub max_voting_period: i64,
    pub execution_delay: i64,
    pub grace_period: i64,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            min_proposal_stake: 1_000_000_000, // 1 SOL
            proposal_rate_limit: 1,
            vote_threshold: 100_000_000, // 0.1 SOL
            min_voting_period: 24 * 60 * 60, // 1 day
            max_voting_period: 7 * 24 * 60 * 60, // 7 days
            execution_delay: 24 * 60 * 60, // 1 day
            grace_period: 3 * 24 * 60 * 60, // 3 days
        }
    }
}

#[account]
#[derive(Debug)]
pub struct GovernanceState {
    pub config: GovernanceConfig,
    pub proposal_count: u64,
    pub total_stake: u64,
    pub authority: Pubkey,
}

impl Default for GovernanceState {
    fn default() -> Self {
        Self {
            config: GovernanceConfig::default(),
            proposal_count: 0,
            total_stake: 0,
            authority: Pubkey::default(),
        }
    }
}

mod governance;
mod governance_state;
mod stake_account;

pub use governance::*;
pub use governance_state::*;
pub use stake_account::*; 