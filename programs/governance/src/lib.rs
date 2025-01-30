use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use std::str::FromStr;

pub mod error;
pub mod state;

// Re-export core types from state module
pub use state::{
    governance::GovernanceParams,
    proposal::{Proposal, ProposalAction},
    vote_record::VoteRecord,
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ProposalState,
    ProposalStatus,
    ChaosParams,
    ChaosMode,
    ChaosCondition,
    DefenseLevel,
    ProposalVotingState,
    ProposalMetadata,
    GovernanceMetrics,
};

pub use error::GovernanceError;

declare_id!("Governance111111111111111111111111111111111");

// Constants for PDA seeds and rate limiting
pub const GOVERNANCE_SEED: &[u8] = b"governance";
pub const STAKE_INFO_SEED: &[u8] = b"stake_info";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const DEFAULT_PROPOSAL_RATE_LIMIT: u64 = 5;
pub const DEFAULT_PROPOSAL_RATE_WINDOW: i64 = 24 * 60 * 60; // 24 hours
pub const GREMLINAI_TOKEN_MINT: &str = "Bx6XZrN7pjbDA5wkiKagbbyHSr1jai45m8peSSmJpump";
pub const DEV_WALLET: &str = "12ZA59vt9MW9XNfpDNThamLmPsPFQ2MEgkngk1F7HGkn";
pub const TREASURY_AUTH_SEED: &[u8] = b"treasury_auth";
pub const EMERGENCY_HALT_SEED: &[u8] = b"emergency_halt";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum EmergencyActionType {
    UpdateConfig(Box<GovernanceConfig>),
    UpdateAuthority(Pubkey),
    HaltProgram,
    ResumeProgram,
    BlockAddress(Pubkey),
    EnableDefenseMode(DefenseLevel),
}

#[event]
pub struct EmergencyActionEvent {
    pub action: EmergencyActionType,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GovernanceConfig {
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
}

impl Default for GovernanceConfig {
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
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TreasuryAction {
    Deposit,
    Withdraw,
}

#[event]
pub struct TreasuryActionEvent {
    pub action: TreasuryAction,
    pub amount: u64,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StakeEvent {
    pub staker: Pubkey,
    pub amount: u64,
    pub locked_until: i64,
    pub timestamp: i64,
}

#[program]
pub mod glitch_gremlin_governance {
    use super::*;
    // Program implementation goes here...
}

