use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;
use solana_program::sysvar::clock::Clock;
use solana_program::sysvar::Sysvar;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ChaosRequest {
    /// Owner of the request
    pub owner: Pubkey,
    /// Amount of tokens locked
    pub amount: u64,
    /// Current status (0=pending, 1=in_progress, 2=completed, 3=failed)
    pub status: u8,
    /// Parameters for the chaos test
    pub params: Vec<u8>,
    /// Reference to results (e.g. IPFS hash)
    pub result_ref: String,
    /// Escrow account for tokens
    pub escrow_account: Pubkey,
    /// Rate limiting data
    pub rate_limit: RateLimitInfo,
    /// When the request was created
    pub created_at: i64,
    /// When the request was completed
    pub completed_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct EscrowAccount {
    /// Amount of tokens held
    pub amount: u64,
    /// Associated chaos request
    pub chaos_request: Pubkey,
    /// Timestamp when escrow expires
    pub expiry: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct StakeAccount {
    /// Unique ID of the stake
    pub id: u64,
    /// Owner of the stake
    pub owner: Pubkey,
    /// Amount of tokens staked
    pub amount: u64,
    /// When the stake was created
    pub start_time: i64,
    /// Duration of lockup in seconds
    pub lockup_period: u64,
    /// Accumulated rewards
    pub rewards: u64,
    /// Associated governance proposal (if any)
    pub proposal_id: Option<u64>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct RateLimitInfo {
    /// Last request timestamp
    pub last_request: i64,
    /// Number of requests in current window
    pub request_count: u32,
    /// Start of current window
    pub window_start: i64,
    /// Number of failed requests (for state-contingent throttling)
    pub failed_requests: u32,
    /// Proof-of-human verification nonce (8 bytes per DESIGN.md 9.1)
    pub human_proof_nonce: [u8; 8],
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct RateLimitConfig {
    /// Maximum requests per window
    pub max_requests: u32,
    /// Window duration in seconds
    pub window_duration: i64,
    /// Minimum time between requests in seconds
    pub min_interval: i64,
    /// Percentage of tokens to burn when rate limited (0-100)
    pub burn_percentage: u8,
    /// Dynamic pricing multiplier factor
    pub dynamic_pricing_factor: u16,
    /// Minimum stake amount required
    pub min_stake_amount: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct TestParams {
    pub quorum: u64,
    pub execution_time: i64,
    pub test_type: String,
    pub duration: i64,
    pub intensity: u8,
    pub concurrency_level: u8,
    pub max_latency: u64,
    pub error_threshold: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct GovernanceProposal {
    pub status: u8,
    pub deadline: i64,
    pub test_params: TestParams,
    /// Unique proposal ID
    pub id: u64,
    /// Creator of the proposal
    pub proposer: Pubkey,
    /// Proposal title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// When voting starts
    pub start_time: i64,
    /// When voting ends
    pub end_time: i64,
    /// Execution delay after passing
    pub execution_delay: u64,
    /// Votes for
    pub votes_for: u64,
    /// Votes against 
    pub votes_against: u64,
    /// Required quorum
    pub quorum: u64,
    /// Whether executed
    pub executed: bool,
    /// Execution timestamp
    pub executed_at: i64,
    /// Security level (0=low, 1=medium, 2=high)
    pub security_level: u8,
    /// Associated chaos request
    pub chaos_request: Option<Pubkey>,
    /// Vote weights by account
    pub vote_weights: Vec<VoteRecord>,
    /// Minimum stake required (from DESIGN.md 9.3)
    pub min_stake_amount: u64,
    /// Execution timestamp (for time-locked chaos)
    pub execution_time: i64,
    /// Slashing percentage (0-100) from DESIGN.md 9.3
    pub slash_percentage: u8,
    /// Insurance fund address from DESIGN.md 9.1
    pub insurance_fund: Pubkey,
    /// Multisig signers (7/10) per DESIGN.md 9.1
    pub multisig_signers: [Pubkey; 10],
    /// Required signatures threshold
    pub required_signatures: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct VoteRecord {
    /// Voter's public key
    pub voter: Pubkey,
    /// Amount of voting power used
    pub weight: u64,
    /// Whether voted yes
    pub support: bool,
    /// Timestamp of vote
    pub timestamp: i64,
    /// Voter type (0=user, 1=delegate)
    pub voter_type: u8,
    /// Staked amount at time of voting
    pub staked_amount: u64,
}

impl ChaosRequest {
    pub fn new(owner: Pubkey, amount: u64, params: Vec<u8>, escrow_account: Pubkey, rate_limit: RateLimitInfo) -> Self {
        let clock = Clock::get().expect("Failed to get clock");
        Self {
            owner,
            amount,
            status: 0,
            params,
            result_ref: String::new(),
            escrow_account,
            rate_limit,
            created_at: clock.unix_timestamp,
            completed_at: 0,
        }
    }
}

impl EscrowAccount {
    pub fn new(amount: u64, chaos_request: Pubkey, expiry: i64) -> Self {
        Self {
            amount,
            chaos_request,
            expiry,
        }
    }
}
