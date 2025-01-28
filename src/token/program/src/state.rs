use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
    msg,
};
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::program_pack::{Pack, Sealed};

// Constants for security requirements
const MIN_COVERAGE_LOW: u8 = 60;
const MIN_COVERAGE_MEDIUM: u8 = 75;
const MIN_COVERAGE_HIGH: u8 = 90;
const MIN_COVERAGE_CRITICAL: u8 = 95;

const VALIDATION_INTERVAL_LOW: u64 = 3600;     // Every hour
const VALIDATION_INTERVAL_MEDIUM: u64 = 1800;  // Every 30 minutes
const VALIDATION_INTERVAL_HIGH: u64 = 600;     // Every 10 minutes
const VALIDATION_INTERVAL_CRITICAL: u64 = 300; // Every 5 minutes

const MIN_STAKE_LOW: u64 = 1_000;
const MIN_STAKE_MEDIUM: u64 = 10_000;
const MIN_STAKE_HIGH: u64 = 100_000;
const MIN_STAKE_CRITICAL: u64 = 1_000_000;

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq, PartialOrd)]
pub enum SecurityLevel {
    Critical,
    High,
    Medium,
    Low,
}

impl Default for SecurityLevel {
    fn default() -> Self {
        SecurityLevel::Low
    }
}

// Enhanced SecurityLevel implementation with comprehensive validation
impl SecurityLevel {
    pub fn validate_hardware_requirements(&self) -> Result<(), ProgramError> {
        match self {
            SecurityLevel::Low => {
                msg!("Validating Low security level requirements");
                // Even low security requires basic memory protection
                if !cfg!(target_feature = "sse2") {
                    msg!("Low security level requires SSE2 support for basic memory protection");
                    return Err(ProgramError::InvalidArgument);
                }
                Ok(())
            },
            SecurityLevel::Medium => {
                msg!("Validating Medium security level requirements");
                if !cfg!(target_feature = "sse4.1") {
                    msg!("Medium security level requires SSE4.1 support for optimized validation");
                    return Err(ProgramError::InvalidArgument);
                }
                if !cfg!(target_feature = "aes") {
                    msg!("Medium security level requires AES support for basic encryption");
                    return Err(ProgramError::InvalidArgument);
                }
                Ok(())
            },
            SecurityLevel::High => {
                msg!("Validating High security level requirements");
                if !cfg!(target_feature = "aes") {
                    msg!("High security level requires AES support for secure operations");
                    return Err(ProgramError::InvalidArgument);
                }
                if !cfg!(target_feature = "avx") {
                    msg!("High security level requires AVX support for advanced vector operations");
                    return Err(ProgramError::InvalidArgument);
                }
                Ok(())
            },
            SecurityLevel::Critical => {
                msg!("Validating Critical security level requirements");
                if !cfg!(target_env = "sgx") {
                    msg!("Critical security level requires SGX support for secure enclave operations");
                    return Err(ProgramError::InvalidArgument);
                }
                if !cfg!(target_feature = "avx2") {
                    msg!("Critical security level requires AVX2 support for cryptographic operations");
                    return Err(ProgramError::InvalidArgument);
                }
                if !cfg!(target_feature = "rdseed") {
                    msg!("Critical security level requires RDSEED support for hardware entropy");
                    return Err(ProgramError::InvalidArgument);
                }
                Ok(())
            }
        }
    }

    pub fn get_minimum_stake(&self) -> u64 {
        match self {
            SecurityLevel::Low => MIN_STAKE_LOW,
            SecurityLevel::Medium => MIN_STAKE_MEDIUM,
            SecurityLevel::High => MIN_STAKE_HIGH,
            SecurityLevel::Critical => MIN_STAKE_CRITICAL,
        }
    }

    pub fn get_minimum_validators(&self) -> u8 {
        match self {
            SecurityLevel::Low => 3,
            SecurityLevel::Medium => 5,
            SecurityLevel::High => 7,
            SecurityLevel::Critical => 9,
        }
    }

    pub fn get_minimum_geographic_regions(&self) -> u8 {
        match self {
            SecurityLevel::Low => 1,
            SecurityLevel::Medium => 2,
            SecurityLevel::High => 3,
            SecurityLevel::Critical => 5,
        }
    }

    pub fn requires_attestation(&self) -> bool {
        matches!(self, SecurityLevel::High | SecurityLevel::Critical)
    }

    pub fn requires_memory_fence(&self) -> bool {
        !matches!(self, SecurityLevel::Low)
    }

    pub fn get_validation_frequency(&self) -> u64 {
        match self {
            SecurityLevel::Low => VALIDATION_INTERVAL_LOW,
            SecurityLevel::Medium => VALIDATION_INTERVAL_MEDIUM,
            SecurityLevel::High => VALIDATION_INTERVAL_HIGH,
            SecurityLevel::Critical => VALIDATION_INTERVAL_CRITICAL,
        }
    }

    pub fn validate_test_params(&self, params: &TestParams) -> Result<(), ProgramError> {
        if params.min_coverage < self.get_minimum_coverage() {
            msg!("Coverage too low for security level: minimum {}% required", self.get_minimum_coverage());
            return Err(ProgramError::InvalidArgument);
        }
        if params.min_validators < self.get_minimum_validators() {
            msg!("Insufficient validators for security level: minimum {} required", self.get_minimum_validators());
            return Err(ProgramError::InvalidArgument);
        }
        if params.min_geographic_regions < self.get_minimum_geographic_regions() {
            msg!("Insufficient geographic distribution: minimum {} regions required", self.get_minimum_geographic_regions());
            return Err(ProgramError::InvalidArgument);
        }
        if self.requires_attestation() && !params.attestation_required {
            msg!("Attestation required for this security level");
            return Err(ProgramError::InvalidArgument);
        }
        if self.requires_memory_fence() && !params.memory_fence_required {
            msg!("Memory fence required for this security level");
            return Err(ProgramError::InvalidArgument);
        }
        Ok(())
    }

    fn get_minimum_coverage(&self) -> u8 {
        match self {
            SecurityLevel::Low => MIN_COVERAGE_LOW,
            SecurityLevel::Medium => MIN_COVERAGE_MEDIUM,
            SecurityLevel::High => MIN_COVERAGE_HIGH,
            SecurityLevel::Critical => MIN_COVERAGE_CRITICAL,
        }
    }
}

// Keep the From implementation for reverse conversion
impl From<&SecurityLevel> for crate::instruction::SecurityLevel {
    fn from(level: &SecurityLevel) -> Self {
        match level {
            SecurityLevel::Low => crate::instruction::SecurityLevel::Low,
            SecurityLevel::Medium => crate::instruction::SecurityLevel::Medium,
            SecurityLevel::High => crate::instruction::SecurityLevel::High,
            SecurityLevel::Critical => crate::instruction::SecurityLevel::Critical,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct TestResults {
    pub status: u8,
    pub compute_units_consumed: u64,
    pub memory_usage: u64,
    pub performance_metrics: Option<Vec<u8>>,
    pub error_logs: Option<String>,
    pub coverage_data: Option<Vec<u8>>,
    pub validator_signature: [u8; 64],
    pub geographic_proof: Vec<u8>,
    pub sgx_quote: Option<Vec<u8>>,
}

impl Default for TestResults {
    fn default() -> Self {
        Self {
            status: 0,
            compute_units_consumed: 0,
            memory_usage: 0,
            performance_metrics: None,
            error_logs: None,
            coverage_data: None,
            validator_signature: [0; 64],
            geographic_proof: Vec::new(),
            sgx_quote: None,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct TestParams {
    pub security_level: u8,
    pub test_duration: u64,
    pub min_coverage: u8,
    pub max_vulnerability_density: u8,
    pub max_duration_seconds: u64,
    pub min_validators: u8,
    pub min_stake_required: u64,
    pub min_geographic_regions: u8,
    pub attestation_required: bool,
    pub memory_fence_required: bool,
    pub entropy_checks: bool,
}

impl Default for TestParams {
    fn default() -> Self {
        Self {
            security_level: 1,
            test_duration: 3600,
            min_coverage: 80,
            max_vulnerability_density: 5,
            max_duration_seconds: 3600,
            min_validators: 3,
            min_stake_required: 1000,
            min_geographic_regions: 3,
            attestation_required: false,
            memory_fence_required: true,
            entropy_checks: true,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct MemorySafetyMetrics {
    pub fence_violations: u32,
    pub page_violations: u32,
    pub stack_violations: u32,
    pub entropy_score: u32,
}

impl Default for MemorySafetyMetrics {
    fn default() -> Self {
        Self {
            fence_violations: 0,
            page_violations: 0,
            stack_violations: 0,
            entropy_score: 1000,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct EscrowAccount {
    /// Amount of tokens held
    pub amount: u64,
    /// Associated chaos request
    pub chaos_request: Pubkey,
    /// Timestamp when escrow expires
    pub expiry: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct StakeInfo {
    pub amount: u64,
    pub locked_until: i64,
    pub owner: Pubkey,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct RateLimitInfo {
    pub window_start: i64,
    pub request_count: u32,
    pub total_stake: u64,
}

impl Default for RateLimitInfo {
    fn default() -> Self {
        Self {
            window_start: 0,
            request_count: 0,
            total_stake: 0,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct RateLimitConfig {
    pub max_requests_per_window: u32,
    pub window_size_seconds: u64,
    pub min_stake_required: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_requests_per_window: 100,
            window_size_seconds: 3600,
            min_stake_required: 1000,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct ChaosRequest {
    pub id: u64,
    pub owner: Pubkey,
    pub target_program: Pubkey,
    pub amount: u64,
    pub status: ChaosRequestStatus,
    pub security_level: SecurityLevel,
    pub test_params: TestParams,
    pub timestamp: i64,
    pub escrow_account: Pubkey,
    pub validator_signatures: Vec<[u8; 64]>,
    pub geographic_proofs: Vec<Vec<u8>>,
    pub attestation_proof: Option<Vec<u8>>,
    pub sgx_quote: Option<Vec<u8>>,
    pub performance_metrics: Option<Vec<u8>>,
}

impl ChaosRequest {
    pub fn new(
        id: u64,
        owner: Pubkey,
        target_program: Pubkey,
        amount: u64,
        security_level: SecurityLevel,
        test_params: TestParams,
        timestamp: i64,
        escrow_account: Pubkey,
    ) -> Self {
        Self {
            id,
            owner,
            target_program,
            amount,
            status: ChaosRequestStatus::Pending,
            security_level,
            test_params,
            timestamp,
            escrow_account,
            validator_signatures: Vec::new(),
            geographic_proofs: Vec::new(),
            attestation_proof: None,
            sgx_quote: None,
            performance_metrics: None,
        }
    }

    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        borsh::from_slice(input).map_err(|_| ProgramError::InvalidInstructionData)
    }

    pub fn pack(&self, output: &mut [u8]) -> Result<(), ProgramError> {
        let data = borsh::to_vec(self).map_err(|_| ProgramError::InvalidInstructionData)?;
        output[..data.len()].copy_from_slice(&data);
        Ok(())
    }
}

impl Sealed for ChaosRequest {}

impl Pack for ChaosRequest {
    const LEN: usize = 1024; // Adjust size based on your struct's actual size

    fn pack_into_slice(&self, dst: &mut [u8]) -> () {
        let data = borsh::to_vec(&self).unwrap_or_default();
        dst[..data.len()].copy_from_slice(&data);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::from_slice(src).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

// Helper method for serialization
impl ChaosRequest {
    pub fn serialize(&self) -> Result<Vec<u8>, ProgramError> {
        borsh::to_vec(self).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, PartialEq)]
pub enum ChaosRequestStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

impl From<u8> for ChaosRequestStatus {
    fn from(status: u8) -> Self {
        match status {
            1 => ChaosRequestStatus::InProgress,
            2 => ChaosRequestStatus::Completed,
            3 => ChaosRequestStatus::Failed,
            _ => ChaosRequestStatus::Pending,
        }
    }
}

impl From<ChaosRequestStatus> for u8 {
    fn from(status: ChaosRequestStatus) -> Self {
        match status {
            ChaosRequestStatus::Pending => 0,
            ChaosRequestStatus::InProgress => 1,
            ChaosRequestStatus::Completed => 2,
            ChaosRequestStatus::Failed => 3,
        }
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq)]
pub enum ValidationMode {
    Standard,
    Strict,
    Permissive,
}

impl Default for ValidationMode {
    fn default() -> Self {
        ValidationMode::Standard
    }
}