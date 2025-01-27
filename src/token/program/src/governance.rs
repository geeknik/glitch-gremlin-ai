use borsh::{BorshSerialize, BorshDeserialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct GovernanceProposal {
    /// Unique ID of the proposal
    pub id: u64,
    /// The proposer's public key
    pub proposer: Pubkey,
    /// Description of the chaos campaign
    pub description: String,
    /// Target program to test
    pub target_program: Pubkey,
    /// Amount of GLITCH tokens staked
    pub staked_amount: u64,
    /// Current vote count
    pub votes_for: u64,
    pub votes_against: u64,
    /// Voting deadline (Unix timestamp)
    pub deadline: i64,
    /// Status of the proposal
    pub status: ProposalStatus,
    /// Escrow account for test funds
    pub escrow_account: Option<Pubkey>,
    /// Test parameters
    pub test_params: TestParams,
    /// Execution time
    pub execution_time: i64,
    /// Execution delay in seconds
    pub execution_delay: i64,
    /// Required quorum percentage
    pub quorum: u64,
    /// Security level
    pub security_level: u8,
    /// Multisig signers
    pub multisig_signers: Vec<Pubkey>,
    /// Required signatures
    pub required_signatures: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, Copy, PartialEq)]
pub enum ProposalStatus {
    Pending,
    Active,
    Approved,
    Rejected,
    Executed,
    Failed
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TestParams {
    pub test_type: String, // FUZZ, LOAD, EXPLOIT, CONCURRENCY
    pub duration: u64,    // in seconds
    pub intensity: u8,    // 1-10
    pub max_latency: u64, // in ms
    pub error_threshold: u8,
    // DESIGN.md 9.6.5 - Enhanced security parameters
    pub security_level: SecurityLevel,
    pub audit_mode: bool,
    pub fuzzing_strategy: FuzzingStrategy,
    pub mutation_rate: f64,
    pub coverage_target: f64,
    // DESIGN.md 9.6.3 - Resource limits
    pub max_compute_units: u32,
    pub memory_limit: u32,    // in MB
    pub concurrent_tests: u8,
    // DESIGN.md 9.1 - Geographic fault injection
    pub required_regions: u8,
    pub min_validator_diversity: u8,
    // DESIGN.md 9.3 - Cryptoeconomic parameters
    pub burn_percentage: u8,
    pub insurance_fund_contribution: u8,
    pub slashing_percentage: u8,
    // DESIGN.md 9.6.2 - Cryptographic attestation
    pub attestation_proof: Option<[u8; 64]>,
    pub validator_signatures: Vec<[u8; 64]>,
    pub sgx_quote: Option<Vec<u8>>,
    // DESIGN.md 9.6.4 - Memory safety
    pub memory_fence_required: bool,
    pub page_access_tracking: bool,
    pub stack_canaries: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum SecurityLevel {
    Standard,
    Enhanced,
    Maximum
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum FuzzingStrategy {
    Random,
    Guided,
    Evolutionary,
    Reinforcement
}

impl GovernanceProposal {
    pub fn new(
        id: u64,
        proposer: Pubkey,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
        test_params: TestParams,
    ) -> Self {
        // DESIGN.md 9.6.4 Memory Safety
        std::arch::asm!("mfence"); // Memory barrier
        std::arch::asm!("lfence"); // Speculative execution barrier

        // Validate test parameters
        assert!(test_params.memory_fence_required, "Memory fencing must be enabled");
        assert!(test_params.page_access_tracking, "Page access tracking required");
        assert!(test_params.stack_canaries, "Stack canaries must be enabled");
        
        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting
        let entropy = solana_program::hash::hash(&[
            proposer.as_ref(),
            &id.to_le_bytes(),
            &deadline.to_le_bytes()
        ]);
        
        let proposal = Self {
            id,
            proposer,
            description,
            target_program,
            staked_amount,
            votes_for: 0,
            votes_against: 0,
            deadline,
            status: ProposalStatus::Pending,
            escrow_account: None,
            test_params,
        };

        // Verify entropy bits
        assert!(entropy.as_ref()[0] & 0xF0 == 0x90, "Invalid entropy pattern");

        proposal
    }
}
