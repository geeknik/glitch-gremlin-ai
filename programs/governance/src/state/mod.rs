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
<<<<<<< HEAD
=======
    pub quorum_percentage: u8,
    pub approval_threshold: u8,

    // Chaos specific parameters
    pub volatility_factor: u8,           // 0-100% chance of chaos events
    pub max_slashing_percentage: u8,     // Maximum % of stake that can be slashed
    pub chaos_mode: ChaosMode,
    pub circuit_breaker_threshold: u64,
    pub recovery_delay: i64,
    pub max_concurrent_chaos_events: u8,
    pub min_time_between_chaos: i64,
    pub chaos_intensity_multiplier: u8,  // 1-10x intensity scaling
    pub targeted_chaos_enabled: bool,    // Enable targeted chaos on specific accounts
    pub random_seed_update_interval: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum ChaosMode {
    Disabled,
    Periodic {
        interval: i64,
        duration: i64,
    },
    Random {
        probability: u8,    // 0-100%
        max_duration: i64,
    },
    Triggered {
        condition: ChaosCondition,
    },
    Adaptive {
        base_intensity: u8,
        scaling_factor: u8,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum ChaosCondition {
    TokenPriceVolatility { threshold: u8 },
    StakingRateChange { percentage: i8 },
    VotingActivitySpike { multiplier: u8 },
    TimeOfDay { hour: u8 },
    CustomMetric { threshold: u64 },
}

impl Default for ChaosParams {
    fn default() -> Self {
        Self {
            max_stake_amount: 1_000_000,
            min_stake_duration: 86_400,    // 1 day
            max_stake_duration: 31_536_000, // 1 year
            min_proposal_delay: 3_600,      // 1 hour
            max_proposal_duration: 604_800,  // 1 week
            min_voting_power: 100,
            quorum_percentage: 10,
            approval_threshold: 60,
            volatility_factor: 50,          // 50% chance of chaos
            max_slashing_percentage: 10,     // Max 10% slashing
            chaos_mode: ChaosMode::Periodic {
                interval: 86_400,           // Daily chaos
                duration: 3_600,            // 1 hour duration
            },
            circuit_breaker_threshold: 1_000_000,
            recovery_delay: 3_600,          // 1 hour recovery
            max_concurrent_chaos_events: 3,
            min_time_between_chaos: 1_800,  // 30 minutes
            chaos_intensity_multiplier: 5,   // 5x base intensity
            targeted_chaos_enabled: false,
            random_seed_update_interval: 300, // 5 minutes
        }
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
    pub quorum_percentage: u8,
    pub approval_threshold: u8,
    pub chaos_params: ChaosParams,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            min_proposal_stake: 1_000_000_000, // 1 SOL
            proposal_rate_limit: 1,
            vote_threshold: 100_000_000, // 0.1 SOL
            min_voting_period: 24 * 60 * 60, // 1 day
            max_voting_period: 7 * 24 * 60 * 60, // 7 days
            quorum_percentage: 10,
            approval_threshold: 60,
            chaos_params: ChaosParams::default(),
        }
    }
}


impl IsInitialized for Proposal {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
>>>>>>> 3107af2 (fix: Remove duplicate GovernanceState and clean up imports)
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
    pub status: ProposalState,  // References the enum
    pub quorum_achieved: bool,
    pub threshold_achieved: bool,
}
>>>>>>> 87e3d7b (refactor: Rename ProposalState to ProposalStateInfo and update status type)
