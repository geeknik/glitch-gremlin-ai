use borsh::{BorshDeserialize, BorshSerialize};
use anchor_lang::prelude::*;
use std::collections::HashMap;

// Module declarations
pub mod governance;
pub mod governance_state;
pub mod governance_metrics;
pub mod proposal;
pub mod stake_account;
pub mod vote_record;

// Common types used across modules
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Vote {
    pub voter: Pubkey,
    pub vote_weight: u64,
    pub vote_type: VoteType,
    pub timestamp: i64,
    pub voter_tokens_locked_until: i64,
    pub voter_power_at_time: u64,
    pub explanation: Option<String>,
    pub vote_choices: Vec<VoteChoice>,
    pub metadata: Option<VoteMetadata>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum VoteType {
    SingleChoice,
    MultiChoice { max_choices: u8 },
    Ranked { max_rank: u8 },
    Quadratic,
    Weighted { max_weight: u64 },
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VoteChoice {
    pub option_index: u8,
    pub rank: Option<u8>,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VoteMetadata {
    pub client_timestamp: i64,
    pub client_ip_hash: String,
    pub voter_token_balance: u64,
    pub voter_nft_weight: Option<u64>,
    pub delegation_address: Option<Pubkey>,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalExecutionParams {
    pub instruction_data: Vec<u8>,
    pub program_id: Pubkey,
    pub accounts: Vec<ProposalAccountMeta>,
    pub timelock_delay: i64,
    pub execution_quorum: u64,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ChaosParams {
    pub max_stake_amount: u64,
    pub min_stake_duration: i64,
    pub max_stake_duration: i64,
    pub min_proposal_delay: i64,
    pub max_proposal_duration: i64,
    pub min_voting_power: u64,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum DefenseLevel {
    Low,
    Medium,
    High,
    Critical
}

// Core types
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
    UpdateParams { min_stake: u64, min_quorum: u8 },
    UpdateAuthority { new_authority: Pubkey },
    UpdateTreasury { new_treasury: Pubkey },
    EmergencyHalt,
    ResumeProgram,
    Custom { data: [u8; 32] },
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
<<<<<<< HEAD
pub struct ProposalVotingState {
    pub yes_votes: u64,
    pub no_votes: u64,
    pub abstain_votes: u64,
    pub vote_records: HashMap<Pubkey, VoteRecord>,
    pub quorum_reached: bool,
    pub vote_end_time: i64,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalMetadata {
    pub title: String,
    pub description: String,
    pub link: Option<String>,
}

// Re-export all types
pub use governance::*;
pub use governance_state::*;
pub use governance_metrics::*;
pub use proposal::*;
pub use stake_account::*;
pub use vote_record::*;
=======
pub struct ProposalStateInfo {
    pub created_at: i64,
    pub executed_at: Option<i64>,
    pub canceled_at: Option<i64>,
    pub voting_ends_at: i64,
    pub execution_delay: u64,
    pub for_votes: u64,
    pub against_votes: u64,
    pub status: ProposalState,
    pub quorum_achieved: bool,
    pub threshold_achieved: bool,
}
>>>>>>> 87e3d7b (refactor: Rename ProposalState to ProposalStateInfo and update status type)
