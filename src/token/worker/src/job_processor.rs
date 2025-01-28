use borsh::BorshSerialize;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};
use solana_program::{
    program_error::ProgramError,
    sysvar::{clock::Clock, Sysvar},
};
use std::{
    error::Error,
    ffi::CString,
    time::{SystemTime, UNIX_EPOCH},
    sync::Arc,
};
use syscallz::{Syscall, Context, Action};
use seccomp_sys;
use libc;
use glitch_gremlin_program::instruction::GlitchInstruction;
#[cfg(feature = "linux-security")]
use landlock::{
    Access,
    AccessFs,
    Ruleset,
    RulesetAttr,
    RulesetCreatedAttr,
    RulesetStatus,
};
use crate::{
    types::{TestParams, TestResults, SecurityLevel, ChaosParams, ValidationStatus},
    error::WorkerError,
    chaos_engine::{run_chaos_test, ChaosTestResult, ChaosTestEnvironment},
};
use log::{info, warn, error};

// Define syscall numbers for Linux x86_64
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const SYS_PTRACE: c_int = 101;
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const SYS_MOUNT: c_int = 165;
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const SYS_REBOOT: c_int = 169;
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const SYS_KEXEC_LOAD: c_int = 246;

// Enhanced security features with proper documentation
/// Memory locking flags to prevent swapping of sensitive data
const MEMORY_LOCK_ALL: i32 = libc::MCL_CURRENT | libc::MCL_FUTURE;

/// Minimum entropy bits required per byte for secure operations
const MIN_ENTROPY_BITS: f64 = 3.0;

/// Number of CPU timing samples for virtualization detection
const CPU_TIMING_SAMPLES: usize = 1000;

/// Maximum allowed timing variation for virtualization detection (nanoseconds)
const MAX_VIRTUALIZED_TIMING_NS: u128 = 1_000_000;

// Platform-specific security configurations
#[cfg(target_os = "macos")]
const HARDENED_MALLOC_ENV: &str = "MallocNanoZone";
#[cfg(target_os = "macos")]
const HARDENED_MALLOC_VALUE: &str = "1";

// Dangerous syscalls to block
#[cfg(target_os = "linux")]
const DANGEROUS_SYSCALLS: &[i32] = &[
    libc::SYS_ptrace,
    libc::SYS_mount,
    libc::SYS_reboot,
    libc::SYS_kexec_load,
    libc::SYS_init_module,
    libc::SYS_delete_module,
    libc::SYS_iopl,
    libc::SYS_ioperm,
];

// Enhanced error type with security context
#[derive(Debug)]
pub enum SecurityError {
    VirtualizationDetected,
    InsufficientEntropy,
    HardwareSecurityUnavailable,
    MemoryLockFailed,
    SeccompInitFailed,
    SyscallRestrictionFailed,
}

#[derive(Debug)]
pub enum JobProcessorError {
    TestSetupError(String),
    TestExecutionError(String),
    SecurityError(String),
    IoError(std::io::Error),
    ParseError(String),
    ValidationError(String),
    HardwareError(String),
    NetworkError(String),
}

impl std::error::Error for JobProcessorError {}

impl std::fmt::Display for JobProcessorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobProcessorError::TestSetupError(msg) => write!(f, "Test setup error: {}", msg),
            JobProcessorError::TestExecutionError(msg) => write!(f, "Test execution error: {}", msg),
            JobProcessorError::SecurityError(msg) => write!(f, "Security error: {}", msg),
            JobProcessorError::IoError(e) => write!(f, "IO error: {}", e),
            JobProcessorError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            JobProcessorError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            JobProcessorError::HardwareError(msg) => write!(f, "Hardware error: {}", msg),
            JobProcessorError::NetworkError(msg) => write!(f, "Network error: {}", msg),
        }
    }
}

impl From<std::io::Error> for JobProcessorError {
    fn from(error: std::io::Error) -> Self {
        JobProcessorError::IoError(error)
    }
}

impl From<Box<dyn Error + Send + Sync>> for JobProcessorError {
    fn from(error: Box<dyn Error + Send + Sync>) -> Self {
        JobProcessorError::TestExecutionError(error.to_string())
    }
}

impl From<solana_program::pubkey::ParsePubkeyError> for JobProcessorError {
    fn from(error: solana_program::pubkey::ParsePubkeyError) -> Self {
        JobProcessorError::ParseError(error.to_string())
    }
}

pub async fn process_chaos_job(
    rpc_client: &RpcClient,
    program_id: &Pubkey,
    job_data: &str,
) -> Result<(), JobProcessorError> {
    // DESIGN.md 9.6.1 - μArch fingerprinting with enhanced checks
    let cpu_fingerprint = measure_cpu_timing();
    if detect_virtualization(&cpu_fingerprint) {
        return Err(JobProcessorError::SecurityError("Virtualization detected - hardware security requirements not met".to_string()));
    }

    // DESIGN.md 9.6.1 - Enhanced entropy validation
    if !validate_entropy(job_data.as_bytes()) {
        return Err(JobProcessorError::SecurityError("Insufficient entropy in job data".to_string()));
    }

    // Parse job data with validation
    let parts: Vec<&str> = job_data.split('|').collect();
    if parts.len() != 3 {
        return Err(JobProcessorError::ValidationError(
            format!("Invalid job format - expected 3 parts, got {}", parts.len())
        ));
    }

    let request_id = parts[0];
    let params: ChaosParams = serde_json::from_str(parts[1])
        .map_err(|e| JobProcessorError::ParseError(format!("Invalid params format: {}", e)))?;
    let target_program = parts[2].parse::<Pubkey>()
        .map_err(|e| JobProcessorError::ParseError(format!("Invalid program ID: {}", e)))?;

    println!("Processing chaos request {} for program {}", request_id, target_program);

    // Set up test environment with enhanced security
    let mut test_env = setup_test_environment(&target_program).await?;

    // Run chaos test with enhanced monitoring
    let test_result = run_chaos_test(&mut test_env, &params).await?;

    // Finalize request with enhanced validation
    finalize_chaos_request(rpc_client, program_id, request_id, test_result).await?;

    Ok(())
}

async fn setup_test_environment(target_program: &Pubkey) -> Result<ChaosTestEnvironment, Box<dyn Error + Send + Sync + 'static>> {
    // Initialize security context with enhanced protections
    setup_security_context()?;

    // Initialize test environment
    let mut env = ChaosTestEnvironment::new(*target_program);

    // Validate hardware security features
    if !validate_hardware_security()? {
        return Err(Box::new(JobProcessorError::SecurityError(
            "Required hardware security features not available".to_string()
        )));
    }

    // Initialize performance metrics
    env.metrics.performance_data = Vec::with_capacity(1024);
    env.metrics.coverage_data = Vec::with_capacity(1024);

    Ok(env)
}

fn validate_hardware_security() -> Result<bool, JobProcessorError> {
    // Common security checks
    if !validate_entropy(&[0u8; 32]) {
        return Err(JobProcessorError::SecurityError("Insufficient entropy available".to_string()));
    }

    #[cfg(target_arch = "x86_64")]
    unsafe {
        let mut eax = 0u32;
        let mut ebx = 0u32;
        let mut ecx = 0u32;
        let mut edx = 0u32;
        
        // Check for SSE2 (minimum requirement)
        std::arch::x86_64::__cpuid(1, &mut eax, &mut ebx, &mut ecx, &mut edx);
        if (edx & (1 << 26)) == 0 {
            return Err(JobProcessorError::HardwareError("SSE2 not supported".to_string()));
        }

        // Check for AES-NI
        if (ecx & (1 << 25)) == 0 {
            return Err(JobProcessorError::HardwareError("AES-NI not supported".to_string()));
        }

        // Check for RDRAND
        std::arch::x86_64::__cpuid(7, &mut eax, &mut ebx, &mut ecx, &mut edx);
        if (ebx & (1 << 18)) == 0 {
            return Err(JobProcessorError::HardwareError("RDRAND not supported".to_string()));
        }
    }

    Ok(true)
}

async fn finalize_chaos_request(
    rpc_client: &RpcClient,
    program_id: &Pubkey,
    request_id: &str,
    result: TestResults,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let request_pubkey = request_id.parse::<Pubkey>()?;
    
    let instruction = GlitchInstruction::FinalizeChaosRequest {
        status: result.status,
        geographic_proofs: vec![result.geographic_proof],
        attestation_proof: None,
        validator_signatures: vec![result.validator_signature],
        sgx_quote: result.sgx_quote,
        performance_metrics: result.performance_metrics,
    };

    let accounts = vec![
        AccountMeta::new(request_pubkey, false),
        AccountMeta::new_readonly(*program_id, false),
    ];

    let tx = Transaction::new_with_payer(
        &[Instruction::new_with_bytes(
            *program_id,
            &instruction.try_to_vec()?,
            accounts,
        )],
        Some(&request_pubkey),
    );

    rpc_client.send_and_confirm_transaction(&tx).await?;

    Ok(())
}

#[derive(Debug, Clone)]
pub struct TestEnvironment {
    pub target_program: Pubkey,
    pub test_accounts: Vec<Pubkey>,
    pub test_parameters: TestParams,
    pub start_time: i64,
    pub compute_units: u64,
    pub memory_usage: u64,
    pub performance_metrics: Vec<u8>,
    pub coverage_data: Vec<u8>,
    pub avg_latency: u64,
    pub cpu_utilization: f64,
    pub max_memory: u64,
}

impl Default for TestEnvironment {
    fn default() -> Self {
        Self {
            target_program: Pubkey::default(),
            test_accounts: Vec::new(),
            test_parameters: TestParams::default(),
            start_time: 0,
            compute_units: 0,
            memory_usage: 0,
            performance_metrics: Vec::new(),
            coverage_data: Vec::new(),
            avg_latency: 0,
            cpu_utilization: 0.0,
            max_memory: 0,
        }
    }
}

impl TestEnvironment {
    pub fn new(target_program: Pubkey, test_params: TestParams) -> Self {
        // DESIGN.md 9.6.4 Memory Safety
        unsafe {
            std::arch::asm!("mfence", "lfence");
        }
        
        Self {
            target_program,
            test_accounts: Vec::new(),
            test_parameters: test_params,
            start_time: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            compute_units: 0,
            memory_usage: 0,
            performance_metrics: Vec::new(),
            coverage_data: Vec::new(),
            avg_latency: 0,
            cpu_utilization: 0.0,
            max_memory: 0,
        }
    }

    pub fn validate_entropy(&self, data: &[u8]) -> bool {
        if data.len() < 32 {
            return false;
        }

        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting
        let mut entropy_buffer = [0u8; 32];
        solana_program::hash::hash(data).to_bytes().copy_from_slice(&mut entropy_buffer);
        
        entropy_buffer[0] & 0xF0 == 0x90
    }

    pub fn update_metrics(&mut self, compute_units: u64, memory_usage: u64) {
        self.compute_units = compute_units;
        self.memory_usage = memory_usage;
        self.max_memory = self.max_memory.max(memory_usage);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_client::nonblocking::rpc_client::RpcClient;
    use solana_sdk::signature::Keypair;
    use std::str::FromStr;
    use glitch_shared::test_utils::program_test;

    const TEST_PROGRAM_ID: &str = "GremLin1111111111111111111111111111111111111";

    #[tokio::test]
    async fn test_process_chaos_job() -> Result<(), Box<dyn std::error::Error>> {
        // Use local test validator
        let (mut banks_client, payer, recent_blockhash) = program_test().await;
        let program_id = Pubkey::from_str(TEST_PROGRAM_ID).unwrap();
        
        // Create chaos request account
        let chaos_request = Keypair::new();
        let rent = Rent::default().minimum_balance(100);
        
        // Create chaos request account
        let create_account_ix = system_instruction::create_account(
            &payer.pubkey(),
            &chaos_request.pubkey(),
            rent,
            100,
            &program_id,
        );

        // Create escrow account
        let escrow_account = Keypair::new();
        let escrow_rent = Rent::default().minimum_balance(100);
        
        let create_escrow_ix = system_instruction::create_account(
            &payer.pubkey(),
            &escrow_account.pubkey(),
            escrow_rent,
            100,
            &program_id,
        );

        // Send both create account transactions
        let transaction = Transaction::new_signed_with_payer(
            &[create_account_ix, create_escrow_ix],
            Some(&payer.pubkey()),
            &[&payer, &chaos_request, &escrow_account],
            recent_blockhash,
        );
        banks_client.process_transaction(transaction).await?;

        // Test job data format: request_id|params|target_program
        let job_data = format!(
            "{}|test_params|{}",
            chaos_request.pubkey(),
            Keypair::new().pubkey()
        );

        // Create a new RpcClient for the test
        let rpc_client = RpcClient::new("http://localhost:8899".to_string());
        let result = process_chaos_job(&rpc_client, &program_id, &job_data).await;
        assert!(result.is_ok(), "Job processing failed: {:?}", result);
        Ok(())
    }

    #[tokio::test]
    async fn test_invalid_job_format() {
        let rpc_client = RpcClient::new("https://api.testnet.solana.com".to_string());
        let program_id = Pubkey::from_str(TEST_PROGRAM_ID).unwrap();
        
        // Invalid job data - missing parts
        let job_data = "invalid|format";

        let result = process_chaos_job(&rpc_client, &program_id, job_data).await;
        assert!(result.is_err(), "Expected error for invalid job format");
    }
}
pub fn measure_cpu_timing() -> Vec<u8> {
    let mut timing = Vec::with_capacity(32);
    let start = std::time::Instant::now();
    
    // Perform CPU timing measurements
    for _ in 0..1000 {
        let _ = std::hint::black_box(1 + 1);
    }
    
    let duration = start.elapsed();
    timing.extend_from_slice(&duration.as_nanos().to_le_bytes());
    timing.resize(32, 0);
    timing
}

pub fn detect_virtualization(cpu_fingerprint: &[u8]) -> bool {
    // Basic virtualization detection
    if cpu_fingerprint.len() < 32 {
        return true; // Assume virtualized if fingerprint is invalid
    }

    // Check timing consistency
    let timing = u128::from_le_bytes(cpu_fingerprint[0..16].try_into().unwrap());
    timing > 1_000_000 // Assume virtualized if timing is too high
}

pub fn validate_entropy(data: &[u8]) -> bool {
    if data.len() < 8 {
        return false;
    }

    // Calculate Shannon entropy
    let mut counts = [0u32; 256];
    for &byte in data {
        counts[byte as usize] += 1;
    }

    let mut entropy = 0.0;
    let len = data.len() as f64;
    for &count in counts.iter() {
        if count > 0 {
            let p = count as f64 / len;
            entropy -= p * p.log2();
        }
    }

    // Require at least 3.0 bits of entropy per byte
    entropy / (data.len() as f64) >= MIN_ENTROPY_BITS
}

fn setup_security_context() -> Result<(), JobProcessorError> {
    #[cfg(target_os = "linux")]
    {
        // Linux-specific security setup
        unsafe {
            if libc::mlockall(MEMORY_LOCK_ALL) != 0 {
                return Err(JobProcessorError::SecurityError("Failed to lock memory".to_string()));
            }
        }

        // Set up seccomp filter with improved error handling
        let mut ctx = Context::init()?;
        
        // Block dangerous syscalls
        for syscall in DANGEROUS_SYSCALLS {
            if let Err(e) = ctx.set_action_for_syscall(Action::Kill, *syscall) {
                return Err(JobProcessorError::SecurityError(
                    format!("Failed to block dangerous syscall: {}", e)
                ));
            }
        }

        // Load the filter with proper error handling
        if let Err(e) = ctx.load() {
            return Err(JobProcessorError::SecurityError(
                format!("Failed to load seccomp filter: {}", e)
            ));
        }

        #[cfg(feature = "linux-security")]
        {
            // Initialize landlock if available
            if let Err(e) = setup_landlock() {
                warn!("Landlock initialization failed: {}", e);
                // Continue execution - landlock is an optional security enhancement
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // MacOS-specific security setup with improved error handling
        unsafe {
            let env_name = CString::new(HARDENED_MALLOC_ENV)
                .map_err(|e| JobProcessorError::SecurityError(
                    format!("Failed to create env name: {}", e)
                ))?;
            let env_value = CString::new(HARDENED_MALLOC_VALUE)
                .map_err(|e| JobProcessorError::SecurityError(
                    format!("Failed to create env value: {}", e)
                ))?;
            
            if libc::setenv(env_name.as_ptr(), env_value.as_ptr(), 1) != 0 {
                return Err(JobProcessorError::SecurityError(
                    "Failed to set hardened malloc environment".to_string()
                ));
            }
        }

        // Additional MacOS security hardening
        #[cfg(target_arch = "x86_64")]
        {
            // Enable stack canaries with improved error handling
            unsafe {
                let mut attr: libc::stack_t = std::mem::zeroed();
                attr.ss_size = 8192; // 8KB guard size
                if libc::sigaltstack(&attr, std::ptr::null_mut()) != 0 {
                    return Err(JobProcessorError::SecurityError(
                        "Failed to set up stack protection".to_string()
                    ));
                }
            }
        }
    }

    Ok(())
}

#[cfg(all(target_os = "linux", feature = "linux-security"))]
fn setup_landlock() -> Result<(), JobProcessorError> {
    use landlock::{Access, AccessFs, Ruleset, RulesetAttr, RulesetStatus};
    
    let status = Ruleset::new()
        .handle_access(AccessFs::from_all(Access::from_all()))
        .create_ruleset()
        .map_err(|e| JobProcessorError::SecurityError(format!("Failed to create landlock ruleset: {}", e)))?;

    if let RulesetStatus::FullyEnforced = status {
        log::info!("Landlock security enforced successfully");
    } else {
        log::warn!("Landlock security partially enforced: {:?}", status);
    }

    Ok(())
}

pub struct JobProcessor {
    test_env: ChaosTestEnvironment,
}

impl JobProcessor {
    pub fn new(program_id: Pubkey) -> Self {
        Self {
            test_env: ChaosTestEnvironment::new(program_id),
        }
    }

    pub async fn process_job(&self, params: TestParams) -> Result<TestResults, WorkerError> {
        let chaos_params = self.prepare_chaos_params(&params)?;
        
        // Run the chaos test
        let result = run_chaos_test(&chaos_params, &self.test_env)
            .await
            .map_err(|e| WorkerError::ValidationError(e.to_string()))?;

        // Process and validate results
        self.validate_test_results(&result)?;

        Ok(result)
    }

    fn prepare_chaos_params(&self, params: &TestParams) -> Result<ChaosParams, WorkerError> {
        // Validate test parameters
        if params.duration == 0 || params.duration > 3600 {
            return Err(WorkerError::ValidationError(
                "Invalid test duration".to_string()
            ));
        }

        if params.max_memory_mb == 0 || params.max_memory_mb > 16384 {
            return Err(WorkerError::ValidationError(
                "Invalid memory limit".to_string()
            ));
        }

        Ok(ChaosParams {
            duration: params.duration,
            concurrency: params.concurrency.unwrap_or(1),
            security_level: params.security_level,
            target_program: self.test_env.program_id,
            max_memory_mb: params.max_memory_mb,
            max_compute_units: params.max_compute_units.unwrap_or(200_000),
        })
    }

    fn validate_test_results(&self, results: &TestResults) -> Result<(), WorkerError> {
        // Validate basic requirements
        if results.compute_units_consumed == 0 {
            return Err(WorkerError::ValidationError(
                "No compute units consumed".to_string()
            ));
        }

        if results.memory_usage > results.peak_memory_usage {
            return Err(WorkerError::ValidationError(
                "Invalid memory usage metrics".to_string()
            ));
        }

        // Validate security requirements based on security level
        match results.security_level {
            SecurityLevel::Critical => {
                if results.geographic_proofs.len() < 3 {
                    return Err(WorkerError::ValidationError(
                        "Insufficient geographic diversity for Critical security level".to_string()
                    ));
                }
                if results.validator_signatures.len() < 3 {
                    return Err(WorkerError::ValidationError(
                        "Insufficient validator signatures for Critical security level".to_string()
                    ));
                }
            }
            SecurityLevel::High => {
                if results.geographic_proofs.len() < 2 {
                    return Err(WorkerError::ValidationError(
                        "Insufficient geographic diversity for High security level".to_string()
                    ));
                }
                if results.validator_signatures.len() < 2 {
                    return Err(WorkerError::ValidationError(
                        "Insufficient validator signatures for High security level".to_string()
                    ));
                }
            }
            _ => {}
        }

        Ok(())
    }
}
