use serde::{Serialize, Deserialize};
use crate::chaos_engine::TestType;
use solana_program::pubkey::Pubkey;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityLevel {
    Critical,
    High,
    Medium,
    Low,
}

impl SecurityLevel {
    pub fn validate_hardware_requirements(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match self {
            SecurityLevel::Critical => {
                // Enhanced hardware security validation for critical operations
                if !Self::has_aes_support() {
                    return Err("AES-NI support required for Critical security level".into());
                }
                if !Self::verify_memory_protection() {
                    return Err("Memory protection features unavailable".into());
                }
                if !Self::has_sse2_support() {
                    return Err("SSE2 support required for Critical security level".into());
                }
            }
            SecurityLevel::High => {
                // Validate AES-NI and memory protection
                if !Self::has_aes_support() {
                    return Err("AES-NI support required for High security level".into());
                }
                if !Self::verify_memory_protection() {
                    return Err("Memory protection features unavailable".into());
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn get_minimum_stake(&self) -> u64 {
        match self {
            SecurityLevel::Critical => 1_000_000,
            SecurityLevel::High => 500_000,
            SecurityLevel::Medium => 100_000,
            SecurityLevel::Low => 10_000,
        }
    }

    pub fn get_validation_frequency(&self) -> u64 {
        match self {
            SecurityLevel::Critical => 100,   // Validate every 100 blocks
            SecurityLevel::High => 500,       // Every 500 blocks
            SecurityLevel::Medium => 1000,    // Every 1000 blocks
            SecurityLevel::Low => 5000,       // Every 5000 blocks
        }
    }

    fn verify_memory_protection() -> bool {
        #[cfg(target_os = "linux")]
        unsafe {
            libc::mlock(std::ptr::null(), 1) == 0
        }
        #[cfg(not(target_os = "linux"))]
        true
    }

    fn has_aes_support() -> bool {
        #[cfg(target_arch = "x86_64")]
        unsafe {
            let mut eax = 0u32;
            let mut ebx = 0u32;
            let mut ecx = 0u32;
            let mut edx = 0u32;
            std::arch::x86_64::__cpuid(1, &mut eax, &mut ebx, &mut ecx, &mut edx);
            (ecx & (1 << 25)) != 0 // Check AES bit
        }
        #[cfg(not(target_arch = "x86_64"))]
        false
    }

    fn has_sse2_support() -> bool {
        #[cfg(target_arch = "x86_64")]
        unsafe {
            let mut eax = 0u32;
            let mut ebx = 0u32;
            let mut ecx = 0u32;
            let mut edx = 0u32;
            std::arch::x86_64::__cpuid(1, &mut eax, &mut ebx, &mut ecx, &mut edx);
            (edx & (1 << 26)) != 0 // Check SSE2 bit
        }
        #[cfg(not(target_arch = "x86_64"))]
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestParams {
    pub duration: u64,
    pub concurrency: Option<u32>,
    pub security_level: SecurityLevel,
    pub max_memory_mb: u64,
    pub max_compute_units: Option<u64>,
}

impl Default for TestParams {
    fn default() -> Self {
        Self {
            duration: 60,
            concurrency: Some(1),
            security_level: SecurityLevel::Low,
            max_memory_mb: 1024,
            max_compute_units: Some(200_000),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResults {
    pub status: u8,
    pub compute_units_consumed: u64,
    pub memory_usage: u64,
    pub performance_metrics: Vec<u8>,
    pub error_logs: Vec<String>,
    pub geographic_proofs: Vec<[u8; 32]>,
    pub peak_memory_usage: u64,
    pub security_level: SecurityLevel,
    pub validation_status: SecurityLevel,
    pub validator_signatures: Vec<[u8; 64]>,
    pub sgx_quote: Option<Vec<u8>>,
    pub latency_ms: u64,
    pub security_score: f64,
    pub throughput: u64,
}

impl Default for TestResults {
    fn default() -> Self {
        Self {
            status: 0,
            compute_units_consumed: 0,
            memory_usage: 0,
            performance_metrics: Vec::new(),
            error_logs: Vec::new(),
            geographic_proofs: Vec::new(),
            peak_memory_usage: 0,
            security_level: SecurityLevel::Low,
            validation_status: SecurityLevel::Low,
            validator_signatures: Vec::new(),
            sgx_quote: None,
            latency_ms: 0,
            security_score: 0.0,
            throughput: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosParams {
    pub duration: u64,
    pub concurrency: u32,
    pub security_level: SecurityLevel,
    pub target_program: Pubkey,
    pub max_memory_mb: u64,
    pub max_compute_units: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConcurrencyResult {
    pub success: bool,
    pub latency: u64,
    pub errors: Vec<String>,
    pub compute_units: u64,
    pub memory_usage: u64,
    pub performance_metrics: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationMetrics {
    pub coverage: u8,
    pub entropy: u8,
    pub attack_surface: u32,
    pub validator_count: u32,
    pub hardware_types: Vec<String>,
    pub geographic_proofs: Vec<[u8; 32]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub compute_units: u64,
    pub memory_usage: u64,
    pub latency_ms: u64,
    pub throughput: u64,
    pub error_rate: f64,
}

fn is_sgx_supported() -> bool {
    #[cfg(target_arch = "x86_64")]
    unsafe {
        let mut eax = 0u32;
        let mut ebx = 0u32;
        let mut ecx = 0u32;
        let mut edx = 0u32;
        std::arch::x86_64::__cpuid_count(0x7, 0, &mut eax, &mut ebx, &mut ecx, &mut edx);
        (ebx & (1 << 2)) != 0 // Check SGX bit
    }
    #[cfg(not(target_arch = "x86_64"))]
    false
}

fn is_aes_supported() -> bool {
    #[cfg(target_arch = "x86_64")]
    unsafe {
        let mut eax = 0u32;
        let mut ebx = 0u32;
        let mut ecx = 0u32;
        let mut edx = 0u32;
        std::arch::x86_64::__cpuid(1, &mut eax, &mut ebx, &mut ecx, &mut edx);
        (ecx & (1 << 25)) != 0 // Check AES bit
    }
    #[cfg(not(target_arch = "x86_64"))]
    false
} 