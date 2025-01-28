use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use solana_program::pubkey::Pubkey;
use strum::{Display, EnumString};
use solana_program::{
    program_error::ProgramError,
    sysvar::{clock::Clock, Sysvar},
};

pub mod error;
pub mod test_utils;
pub mod validation;

#[cfg(feature = "governance")]
pub mod governance;
#[cfg(feature = "metrics")]
pub mod metrics;
#[cfg(feature = "telemetry")]
pub mod telemetry;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[repr(u8)]
pub enum SecurityLevel {
    Critical = 0,
    High = 1,
    Medium = 2,
    Low = 3,
}

impl SecurityLevel {
    pub fn from_u8(value: u8) -> Result<Self, ProgramError> {
        match value {
            0 => Ok(SecurityLevel::Critical),
            1 => Ok(SecurityLevel::High),
            2 => Ok(SecurityLevel::Medium),
            3 => Ok(SecurityLevel::Low),
            _ => Err(ProgramError::InvalidArgument),
        }
    }

    pub fn to_u8(&self) -> u8 {
        match self {
            SecurityLevel::Critical => 0,
            SecurityLevel::High => 1,
            SecurityLevel::Medium => 2,
            SecurityLevel::Low => 3,
        }
    }

    pub fn get_required_entropy(&self) -> u8 {
        match self {
            SecurityLevel::Critical => 255,
            SecurityLevel::High => 192,
            SecurityLevel::Medium => 128,
            SecurityLevel::Low => 64,
        }
    }

    pub fn get_required_coverage(&self) -> u8 {
        match self {
            SecurityLevel::Critical => 100,
            SecurityLevel::High => 80,
            SecurityLevel::Medium => 60,
            SecurityLevel::Low => 40,
        }
    }

    pub fn validate_hardware_requirements(&self) -> Result<(), error::SecurityError> {
        match self {
            SecurityLevel::Critical => {
                if !validate_hardware_security() {
                    return Err(error::SecurityError::HardwareSecurityUnavailable);
                }
                Ok(())
            }
            SecurityLevel::High => {
                if !validate_basic_security() {
                    return Err(error::SecurityError::InsufficientEntropy);
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

impl BorshSerialize for SecurityLevel {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        BorshSerialize::serialize(&self.to_u8(), writer)
    }
}

impl BorshDeserialize for SecurityLevel {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        let value = u8::deserialize_reader(reader)?;
        SecurityLevel::from_u8(value).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Invalid SecurityLevel value: {}", e)
            )
        })
    }
}

// Enhanced ChaosParams with validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosParams {
    pub duration: u64,
    pub concurrency: u8,
    pub security_level: SecurityLevel,
    pub target_program: Pubkey,
    pub max_memory_mb: u64,
    pub max_compute_units: u64,
}

impl ChaosParams {
    pub fn validate(&self) -> Result<(), error::WorkerError> {
        if self.duration < 60 || self.duration > 3600 {
            return Err(error::WorkerError::InvalidInput(
                "Duration must be between 60-3600s".to_string()
            ));
        }

        if self.concurrency < 1 || self.concurrency > 20 {
            return Err(error::WorkerError::InvalidInput(
                "Concurrency must be between 1-20".to_string()
            ));
        }

        if self.max_memory_mb > 4096 {
            return Err(error::WorkerError::ResourceLimitExceeded(
                "Maximum memory cannot exceed 4GB".to_string()
            ));
        }

        Ok(())
    }
}

impl Default for ChaosParams {
    fn default() -> Self {
        Self {
            duration: 300,  // 5 minutes default
            concurrency: 4, // 4 concurrent tasks default
            security_level: SecurityLevel::Medium,
            target_program: Pubkey::default(),
            max_memory_mb: 1024, // 1GB default
            max_compute_units: 200_000, // 200k CU default
        }
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct TestResults {
    pub status: u8,
    pub compute_units: u64,
    pub memory_usage: u64,
    pub performance_metrics: Option<Vec<u8>>,
    pub error_logs: Option<Vec<String>>,
    pub coverage_data: Option<Vec<u8>>,
    pub validator_signature: Vec<u8>,
    pub geographic_proofs: Vec<Vec<u8>>,
    pub sgx_quote: Option<Vec<u8>>,
    pub test_duration: u64,
    pub peak_memory_usage: u64,
    pub total_instructions: u64,
    pub validation_score: f64,
    pub security_level: SecurityLevel,
    pub latency_ms: u64,
    pub security_score: f64,
    pub throughput: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct ConcurrencyResult {
    pub success: bool,
    pub latency: u64,
    pub errors: Vec<String>,
    pub compute_units: u64,
    pub memory_usage: u64,
    pub performance_metrics: Vec<u8>,
}

impl Default for ConcurrencyResult {
    fn default() -> Self {
        Self {
            success: false,
            latency: 0,
            errors: Vec::new(),
            compute_units: 0,
            memory_usage: 0,
            performance_metrics: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct TestParams {
    pub target_program: Pubkey,
    pub security_level: SecurityLevel,
    pub duration: u64,
    pub concurrency: u8,
    pub max_memory_mb: u64,
    pub max_compute_units: u64,
}

impl Default for TestParams {
    fn default() -> Self {
        Self {
            target_program: Pubkey::default(),
            security_level: SecurityLevel::Medium,
            duration: 300,
            concurrency: 4,
            max_memory_mb: 1024,
            max_compute_units: 200_000,
        }
    }
}

fn validate_hardware_security() -> bool {
    #[cfg(target_arch = "x86_64")]
    unsafe {
        let mut eax = 0u32;
        let mut ebx = 0u32;
        let mut ecx = 0u32;
        let mut edx = 0u32;
        
        // Check for SSE2 (minimum requirement)
        std::arch::x86_64::__cpuid(1, &mut eax, &mut ebx, &mut ecx, &mut edx);
        if (edx & (1 << 26)) == 0 {
            return false;
        }

        // Check for AES-NI
        if (ecx & (1 << 25)) == 0 {
            return false;
        }

        // Check for RDRAND
        std::arch::x86_64::__cpuid(7, &mut eax, &mut ebx, &mut ecx, &mut edx);
        if (ebx & (1 << 18)) == 0 {
            return false;
        }

        true
    }

    #[cfg(not(target_arch = "x86_64"))]
    false
}

fn validate_basic_security() -> bool {
    // Check system entropy
    let mut buffer = [0u8; 32];
    getrandom::getrandom(&mut buffer).is_ok()
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct ChaosRequest {
    pub owner: Pubkey,
    pub security_level: SecurityLevel,
    pub params: Vec<u8>,
    pub status: u8,
}

impl ChaosRequest {
    pub fn new(owner: Pubkey, security_level: SecurityLevel, params: Vec<u8>) -> Self {
        Self {
            owner,
            security_level,
            params,
            status: 0,
        }
    }

    pub fn validate(&self) -> Result<(), error::WorkerError> {
        // Validate minimum parameter lengths based on security level
        let min_params = match self.security_level {
            SecurityLevel::Critical => 32,
            SecurityLevel::High => 16,
            SecurityLevel::Medium => 8,
            SecurityLevel::Low => 4,
        };

        if self.params.len() < min_params {
            return Err(error::WorkerError::InvalidInstruction);
        }

        // Validate hardware requirements
        self.security_level.validate_hardware_requirements()
            .map_err(|e| error::WorkerError::SecurityError(e))?;

        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[repr(u8)]
pub enum ValidationMode {
    Standard = 0,
    Enhanced = 1,
    Strict = 2,
}

impl ValidationMode {
    pub fn from_u8(value: u8) -> Result<Self, ProgramError> {
        match value {
            0 => Ok(ValidationMode::Standard),
            1 => Ok(ValidationMode::Enhanced),
            2 => Ok(ValidationMode::Strict),
            _ => Err(ProgramError::InvalidArgument),
        }
    }

    pub fn to_u8(&self) -> u8 {
        match self {
            ValidationMode::Standard => 0,
            ValidationMode::Enhanced => 1,
            ValidationMode::Strict => 2,
        }
    }

    pub fn get_validation_threshold(&self) -> u8 {
        match self {
            ValidationMode::Standard => 70,
            ValidationMode::Enhanced => 85,
            ValidationMode::Strict => 95,
        }
    }
}

impl BorshSerialize for ValidationMode {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        BorshSerialize::serialize(&self.to_u8(), writer)
    }
}

impl BorshDeserialize for ValidationMode {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        let value = u8::deserialize_reader(reader)?;
        ValidationMode::from_u8(value).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Invalid ValidationMode value: {}", e)
            )
        })
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct ChaosRequestInfo {
    pub request: ChaosRequest,
    pub created_at: i64,
    pub status: RequestStatus,
    pub results: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, BorshSerialize, BorshDeserialize)]
pub enum RequestStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_level_serialization() {
        let level = SecurityLevel::High;
        let mut serialized = vec![];
        level.serialize(&mut serialized).unwrap();
        let mut reader = &serialized[..];
        let deserialized = SecurityLevel::deserialize_reader(&mut reader).unwrap();
        assert_eq!(level, deserialized);
    }

    #[test]
    fn test_validation_mode_serialization() {
        let mode = ValidationMode::Enhanced;
        let mut serialized = vec![];
        mode.serialize(&mut serialized).unwrap();
        let mut reader = &serialized[..];
        let deserialized = ValidationMode::deserialize_reader(&mut reader).unwrap();
        assert_eq!(mode, deserialized);
    }

    #[test]
    fn test_chaos_request_validation() {
        let request = ChaosRequest::new(
            Pubkey::new_unique(),
            SecurityLevel::High,
            vec![1; 20], // Valid length for High security
        );
        assert!(request.validate().is_ok());

        let invalid_request = ChaosRequest::new(
            Pubkey::new_unique(),
            SecurityLevel::High,
            vec![1; 10], // Invalid length for High security
        );
        assert!(invalid_request.validate().is_err());
    }
}
