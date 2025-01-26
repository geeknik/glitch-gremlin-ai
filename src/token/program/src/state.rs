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
    /// Maximum requests per window with dynamic adjustment
    pub max_requests: u32,
    /// Window duration in seconds with geographic diversity factor
    pub window_duration: i64,
    // DESIGN.md 9.1 - Enhanced rate limiting
    pub geographic_multiplier: f64,
    pub validator_weight: f64,
    pub attestation_requirement: u8,
    /// Minimum time between requests in seconds
    pub min_interval: i64,
    /// Percentage of tokens to burn when rate limited (0-100)
    pub burn_percentage: u8,
    /// Dynamic pricing multiplier factor
    pub dynamic_pricing_factor: u16,
    /// Minimum stake amount required
    pub min_stake_amount: u64,
    // DESIGN.md 9.1 - Dynamic request pricing
    pub base_fee: u64,
    pub max_multiplier: u16,
    pub cooldown_period: i64,
    // DESIGN.md 9.3 - Burn redirect mechanism
    pub burn_redirect_ratio: u8,    // Percentage to insurance fund
    pub insurance_fund: Pubkey,
    // DESIGN.md 9.6.1 - Request validation
    pub min_entropy_bits: u8,
    pub max_request_size: u32,
    pub required_attestations: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct TestParams {
    // DESIGN.md 9.6.3 - Simulation containment parameters
    pub max_cpu_cycles: u64,
    pub memory_limit_mb: u8,
    pub max_network_ops: u32,
    pub allowed_syscalls: Vec<String>,
    pub quorum: u64,
    pub execution_time: i64,
    pub test_type: String,
    pub duration: i64,
    pub intensity: u8,
    pub concurrency_level: u8,
    pub max_latency: u64,
    pub error_threshold: u8,
    // Security parameters from DESIGN.md 9.6
    pub entropy_checks: bool,
    pub memory_safety: u8,
    pub syscall_filter: Vec<String>,
    pub page_quarantine: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct GovernanceProposal {
    pub status: u8,
    pub deadline: i64,
    pub test_params: TestParams,
    // DESIGN.md 9.6.2 - Enhanced cryptographic attestation
    pub attestation_signatures: Vec<[u8; 64]>,
    pub validator_proofs: Vec<Vec<u8>>,
    pub sgx_quote: Option<Vec<u8>>,
    // DESIGN.md 9.6.4 - Memory safety tracking
    pub memory_fence_count: u32,
    pub page_access_violations: u32,
    pub stack_canary_checks: u32,
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
    // DESIGN.md 9.3 - Enhanced voting mechanics
    pub lockup_duration: i64,
    pub voting_power_multiplier: f64,
    pub delegation_depth: u8,
    // DESIGN.md 9.1 - Geographic diversity
    pub validator_region: u8,
    pub attestation_count: u8,
    // DESIGN.md 9.6.2 - Cryptographic attestation
    pub signature: [u8; 64],
    pub attestation_proof: Vec<u8>,
}

impl ChaosRequest {
    pub fn new(owner: Pubkey, amount: u64, params: Vec<u8>, escrow_account: Pubkey, rate_limit: RateLimitInfo) -> Self {
        let clock = Clock::get().expect("Failed to get clock");
        
        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting with additional entropy sources
        let entropy = solana_program::hash::hash(&[
            owner.as_ref(),
            &amount.to_le_bytes(),
            &clock.unix_timestamp.to_le_bytes(),
            &clock.slot.to_le_bytes(),
            &rate_limit.request_count.to_le_bytes(),
            &rate_limit.human_proof_nonce,
            // Additional entropy sources from DESIGN.md 9.6.1
            &clock.epoch.to_le_bytes(),
            &clock.leader_schedule_epoch.to_le_bytes(),
            // Hardware entropy
            &std::arch::x86_64::_rdrand64_step().unwrap_or(0).to_le_bytes(),
            // Process entropy
            &std::process::id().to_le_bytes()
        ]);
        
        // DESIGN.md 9.6.4 - Memory safety barriers
        std::arch::asm!("mfence");
        std::arch::asm!("lfence");
        
        let request = Self {
            owner,
            amount,
            status: 0,
            params,
            result_ref: String::new(),
            escrow_account,
            rate_limit,
            created_at: clock.unix_timestamp,
            completed_at: 0,
        };

        // Store in database with entropy validation
        tokio::spawn(async move {
            if let Ok(db) = DatabaseService::new().await {
                if let Err(e) = db.store_chaos_request_with_entropy(&request, entropy).await {
                    msg!("Failed to store chaos request: {}", e);
                }
            }
        });

        request
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
