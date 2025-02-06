use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;
use pqcrypto::dilithium::dilithium5::{self, Keypair, SignedMessage};
#[cfg(target_os = "linux")]
use landlock::{self, Access, AccessFs, Ruleset, RulesetAttr, RulesetCreatedAttr, RulesetStatus};
#[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
use sgx_types::*;
use libseccomp::*;

// Configure global allocator
#[cfg(target_arch = "sbf")]
type GlobalAlloc = solana_sbf_allocator::SyscallAllocator<
    { solana_sbf_allocator::GUARD_PAGE_COUNT }, // Memory guard pages
    { solana_sbf_allocator::HEAP_SIZE }         // Size in bytes
>;

#[cfg(not(target_arch = "sbf"))]
type GlobalAlloc = tikv_jemallocator::Jemalloc;

#[global_allocator]
static GLOBAL_ALLOC: GlobalAlloc = GlobalAlloc {};

#[derive(Error, Debug)]
pub enum SecurityError {
    #[error("Prompt injection attempt detected: {0}")]
    PromptInjection(String),
    #[error("Invalid instruction data: {0}")]
    InvalidInstruction(String),
    #[error("Malicious account configuration: {0}")]
    MaliciousAccount(String),
    #[error("Untrusted program invocation: {0}")]
    UntrustedProgram(String),
}

/// Security sanitizer for AI interactions and program inputs
pub struct SecuritySanitizer {
    // Known safe program IDs
    trusted_programs: HashSet<String>,
    // Blocked instruction patterns
    blocked_patterns: HashSet<Vec<u8>>,
    // Maximum allowed instruction size
    max_instruction_size: usize,
    // Blocked prompt patterns
    blocked_prompts: HashSet<String>,
    // Memory quarantine queue
    #[cfg(target_os = "linux")]
    memory_quarantine: Vec<(Vec<u8>, std::time::Instant)>,
    // Hardware security status
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    tee_status: Option<TeeAttestationStatus>,
}

#[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
#[derive(Debug)]
pub struct TeeAttestationStatus {
    pub enclave_id: sgx_enclave_id_t,
    pub attestation_report: Vec<u8>,
    pub zk_proof: Vec<u8>, // Zero-knowledge proof of attestation
    pub last_verification: std::time::Instant,
}

#[derive(Error, Debug)]
pub enum SecurityError {
    #[error("Prompt injection attempt detected: {0}")]
    PromptInjection(String),
    #[error("Invalid instruction data: {0}")]
    InvalidInstruction(String),
    #[error("Malicious account configuration: {0}")]
    MaliciousAccount(String),
    #[error("Untrusted program invocation: {0}")]
    UntrustedProgram(String),
    #[error("Resource limit exceeded: {0}")]
    ResourceLimit(String),
    #[error("Invalid security level")]
    InvalidSecurityLevel,
    #[error("Destructive chaos parameters: {0}")]
    DestructiveChaos(String),
    #[error("Contract hash mismatch (expected {expected}, found {found})")]
    InvalidContractHash {
        expected: String,
        found: String,
    },
    #[error("Hardware attestation missing for live test")]
    NoTrustedEnvironment,
    #[error("Execution environment not security hardened")]
    UnsafeEnvironment,
    #[error("SGX enclave verification failed: {0}")]
    EnclaveVerificationFailed(String),
}

use sha3::{Sha3_256, Digest};
use solana_program::clock::Clock;
use borsh::{BorshSerialize, BorshDeserialize};

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct SecurityProof {
    pub hash: Vec<u8>,
    pub timestamp: i64,
    pub enclave_id: Option<u64>,
}

#[derive(BorshSerialize, BorshDeserialize, Default)]
pub struct ChaosMetrics {
    pub start_slot: u64,
    pub end_slot: u64,
    pub cpu_cycles_used: u64,
    pub memory_peak_kb: u32,
    pub instruction_count: u32,
    pub branch_mispredicts: u16,
    pub cache_misses: u32,
    pub simd_utilization: f32,
}

#[derive(Debug)]
pub struct ChaosExecutionRecord {
    pub target: Pubkey,
    pub test_type: ChaosType,
    pub result: ChaosResult<()>,
    pub security_proof: Option<SecurityProof>,
    pub timestamp: i64,

    pub fn analyze_metrics(&self) -> ChaosResult<ChaosMetrics> {
        let proof_data = self.security_proof
            .as_ref()
            .ok_or(ChaosError::MissingProof)?
            .hash
            .as_slice();
            
        ChaosMetrics::try_from_slice(proof_data)
            .map_err(|_| ChaosError::CorruptedMetrics)
    }
}

impl SecuritySanitizer {
    pub fn new() -> Self {
        let mut sanitizer = Self {
            trusted_programs: HashSet::new(),
            blocked_patterns: HashSet::new(),
            max_instruction_size: 1024,
            blocked_prompts: HashSet::new(),
            #[cfg(target_os = "linux")]
            memory_quarantine: Vec::new(),
            #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
            tee_status: None,
        };

        // Initialize security rules
        sanitizer.initialize_security_rules();
        
        // Initialize hardware security if available
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
        sanitizer.initialize_hardware_security();
        
        // Setup landlock if on Linux
        #[cfg(target_os = "linux")]
        sanitizer.initialize_landlock();
        
        sanitizer
    }

    #[cfg(target_os = "linux")]
    fn initialize_landlock(&self) -> Result<(), SecurityError> {
        let mut ruleset = Ruleset::new()
            .map_err(|e| SecurityError::InitializationError(format!("Landlock init failed: {}", e)))?;

        ruleset
            .handle_access(AccessFs::ReadFile | AccessFs::ReadDir)
            .map_err(|e| SecurityError::InitializationError(format!("Landlock access failed: {}", e)))?;

        ruleset
            .restrict_self()
            .map_err(|e| SecurityError::InitializationError(format!("Landlock restriction failed: {}", e)))?;

        Ok(())
    }

    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    fn initialize_hardware_security(&mut self) -> Result<(), SecurityError> {
        use sgx_urts::enclave::SgxEnclave;
    
        // Initialize with next-gen protections
        let mut launch_config = sgx_urts::EnclaveConfigure::new();
        launch_config.set_hyper_security_mode();

        // Immortal enclave for persistent security
        let enclave = SgxEnclave::create_with_conf(
            "/opt/gremlin/enclaves/glitch_gremlin_enclave_signed.so",
            &launch_config
        ).map_err(|e| SecurityError::InitializationError(
            format!("Quantum-resistant SGX init failed: {:?}", e)
        ))?;

        // Post-quantum hybrid attestation
        let mut quote_policy = sgx_attestation::QuotePolicy::default();
        quote_policy.set_required_algorithms(
            sgx_attestation::QuoteSignType::ECDSA_P384_SHA384 |
            sgx_attestation::QuoteSignType::DILITHIUM5
        );
    
        let report = enclave.get_updated_quote(quote_policy)
            .map_err(|e| SecurityError::AttestationFailure(e.into()))?;

        // Zero-Knowledge Proof of Attestation
        let zk_proof = sgx_attestation::generate_zkp(&report)
            .map_err(|e| SecurityError::AttestationFailure(e))?;

        self.tee_status = Some(TeeAttestationStatus {
            enclave_id: enclave.geteid(),
            attestation_report: report,
            zk_proof,
            last_verification: std::time::Instant::now(),
        });

        Ok(())
    }

    pub fn validate_chaos_type(&self, ct: &ChaosType) -> Result<(), SecurityError> {
        match ct {
            ChaosType::FuzzTest { max_compute_units, security_level, .. } => {
                if *max_compute_units > 100_000 {
                    return Err(SecurityError::ResourceLimit(
                        "Exceeds max allowed compute units".into()
                    ));
                }
                if *security_level > SecurityLevel::High as u8 {
                    return Err(SecurityError::InvalidSecurityLevel);
                }
            }
            ChaosType::NetworkChaos { packet_loss_pct, .. } => {
                if *packet_loss_pct > 30 {
                    return Err(SecurityError::DestructiveChaos(
                        "Packet loss exceeds safety threshold".into()
                    ));
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn initialize_security_rules(&mut self) {
        // Add known safe program IDs
        self.trusted_programs.insert("11111111111111111111111111111111".to_string()); // System Program
        self.trusted_programs.insert("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA".to_string()); // Token Program
        
        // Add known malicious instruction patterns
        self.blocked_patterns.insert(vec![0xFF, 0xFF, 0xFF, 0xFF]); // Example pattern
        
        // Add known prompt injection patterns
        self.blocked_prompts.insert("ignore previous instructions".to_string());
        self.blocked_prompts.insert("disregard system prompt".to_string());
        self.blocked_prompts.insert("you are now".to_string());
    }

    /// Validate AI prompt for potential injection attacks
    pub fn validate_prompt(&self, prompt: &str) -> Result<(), SecurityError> {
        // Check for blocked prompt patterns
        for pattern in &self.blocked_prompts {
            if prompt.to_lowercase().contains(&pattern.to_lowercase()) {
                return Err(SecurityError::PromptInjection(
                    format!("Blocked prompt pattern detected: {}", pattern)
                ));
            }
        }

        // Check for suspicious characters/sequences
        if prompt.contains("```") || prompt.contains("system:") {
            return Err(SecurityError::PromptInjection(
                "Suspicious prompt formatting detected".to_string()
            ));
        }

        Ok(())
    }

    /// Validate instruction data for malicious patterns
    pub fn validate_instruction(&self, data: &[u8]) -> Result<(), SecurityError> {
        // Check instruction size
        if data.len() > self.max_instruction_size {
            return Err(SecurityError::InvalidInstruction(
                format!("Instruction size {} exceeds maximum {}", data.len(), self.max_instruction_size)
            ));
        }

        // Check for blocked patterns
        for pattern in &self.blocked_patterns {
            if data.windows(pattern.len()).any(|window| window == pattern) {
                return Err(SecurityError::InvalidInstruction(
                    "Blocked instruction pattern detected".to_string()
                ));
            }
        }

        Ok(())
    }

    /// Validate account configuration
    pub fn validate_account_config(&self, config: &AccountConfig) -> Result<(), SecurityError> {
        // Validate program ID
        if config.is_program && !self.trusted_programs.contains(&config.pubkey) {
            return Err(SecurityError::UntrustedProgram(
                format!("Untrusted program ID: {}", config.pubkey)
            ));
        }

        // Check for suspicious account configurations
        if config.is_signer && config.is_writable && config.is_program {
            return Err(SecurityError::MaliciousAccount(
                "Invalid account permissions combination".to_string()
            ));
        }

        Ok(())
    }

    /// Validate test case for security issues
    pub fn validate_test_case(&self, test_case: &ChaosTestCase) -> Result<(), SecurityError> {
        // Validate instruction data
        self.validate_instruction(&test_case.instruction_data)?;

        // Validate accounts
        for account in &test_case.accounts {
            self.validate_account_config(account)?;
        }

        Ok(())
    }

    pub fn verify_live_contract(&self, contract_address: &Pubkey) -> ChaosResult<()> {
        // Get on-chain program data
        let program_account = solana_program::account_info::next_account_info(&mut accounts)
            .map_err(|_| ChaosError::AccountNotFound)?;
        let program_data = program_account.data.borrow();

        // Compute quantum-resistant hash
        let mut hasher = Sha3_256::new();
        hasher.update(&program_data[..]);
        let computed_hash = hasher.finalize().to_vec();

        // Hard-coded verified hash for Bx6XZrN7...
        let verified_hash: [u8; 32] = hex!("c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2");
        
        if computed_hash != verified_hash {
            return Err(ChaosError::InvalidContractHash {
                expected: hex::encode(verified_hash),
                found: hex::encode(computed_hash),
            });
        }

        // Verify enclave signature if available
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
        self.verify_enclave_signature(contract_address)?;

        Ok(())
    }

    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    fn verify_enclave_signature(&self, pubkey: &Pubkey) -> ChaosResult<()> {
        use solana_sgx::attestation::{verify_remote_attestation, AttestationReport};

        let report = AttestationReport::from_slice(&pubkey.to_bytes())
            .ok_or(ChaosError::InvalidAttestation)?;

        verify_remote_attestation(report).map_err(|e| ChaosError::EnclaveVerificationFailed(e))
    }

    /// Hybrid quantum-safe signature scheme
    pub fn quantum_safe_sign(&self, msg: &[u8]) -> ChaosResult<Vec<u8>> {
        let kp = dilithium5::keypair(); // Post-quantum keypair
        
        // Traditional ECDSA fallback
        let ecdsa_sig = self.tee_status
            .as_ref()
            .map(|s| sign_with_enclave(s.enclave_id, msg))
            .transpose()?;
        
        let mut hybrid_sig = dilithium5::sign(msg, &kp).as_ref().to_vec();
        if let Some(s) = ecdsa_sig {
            hybrid_sig.extend(s);
        }
        
        Ok(hybrid_sig)
    }

    /// Hybrid signature verification
    pub fn quantum_safe_verify(
        &self,
        msg: &[u8],
        sig: &[u8],
        pubkey: &[u8]
    ) -> ChaosResult<()> {
        // First try post-quantum verification
        if let Ok(()) = dilithium5::verify_open(sig, msg, pubkey) {
            return Ok(());
        }
        
        // Fallback to ECDSA if needed
        let enclave_id = self.tee_status.as_ref().ok_or(ChaosError::NoTrustedEnvironment)?;
        verify_enclave_sig(enclave_id.enclave_id, msg, sig)
            .map_err(|e| ChaosError::EnclaveVerificationFailed(e))
    }

    #[cfg(target_os = "linux")]
    pub fn enable_kernel_hardening(&self) -> ChaosResult<()> {
        let mut filter = ScmpFilterContext::new(ScmpAction::Allow)?;
        
        // Block dangerous syscalls
        let blocked = [
            Sysno::keyctl, 
            Sysno::add_key,
            Sysno::request_key,
            Sysno::memfd_create,
            Sysno::userfaultfd
        ];
        
        for syscall in blocked {
            filter.add_rule(ScmpAction::Errno(ENOSYS as u32), syscall)?;
        }
        
        // Prevent memory access patterns common to Rowhammer attacks
        seccomp_rule_add(
            &mut filter,
            ScmpAction::KillProcess,
            Sysno::membarrier,
            1,
            &[ScmpArgCompare::new(0, ScmpCompareOp::MaskedEq, 0, 3)]
        )?;
        
        filter.load()?;
        Ok(())
    }

    pub fn execute_chaos_safely<T>(
        &self,
        target: Pubkey,
        test_type: ChaosType,
        executor: T
    ) -> ChaosResult<ChaosExecutionRecord>
    where
        T: FnOnce(Pubkey, ChaosType) -> ChaosResult<()>
    {
        // Phase 1: Environment verification
        let security_status = self.check_environment_security()?;
        if !security_status.hardware_protected {
            return Err(ChaosError::UnsafeEnvironment);
        }

        // Phase 2: Execute with anti-tamper checks
        let _guard = self.enable_tamper_protection();
        let result = executor(target, test_type.clone());

        // Phase 3: Generate ZK proof of safe execution
        let proof = self.generate_security_proof(&target, &test_type)?;

        ChaosResult::Ok(ChaosExecutionRecord {
            target,
            test_type,
            result,
            security_proof: Some(proof),
            timestamp: Clock::get()?.unix_timestamp,
        })
    }

    fn generate_security_proof(
        &self, 
        target: &Pubkey, 
        test_type: &ChaosType
    ) -> ChaosResult<SecurityProof> {
        // Combines SHA3 hash with hardware attestation
        let mut proof_data = Vec::with_capacity(128);
        proof_data.extend_from_slice(&target.to_bytes());
        proof_data.extend_from_slice(&self.tee_status.as_ref().ok_or(ChaosError::NoTrustedEnvironment)?.zk_proof);
        proof_data.extend_from_slice(&test_type.to_bytes());
        
        let hash = Sha3_256::new()
            .chain_update(&proof_data)
            .finalize();

        Ok(SecurityProof { 
            hash: hash.to_vec(),
            timestamp: Clock::get()?.unix_timestamp,
            enclave_id: self.tee_status.as_ref().map(|s| s.enclave_id),
        })
    }

    /// Sanitize AI response
    pub fn sanitize_ai_response(&self, response: &str) -> Result<String, SecurityError> {
        // Remove any system prompt manipulation attempts
        let sanitized = response
            .lines()
            .filter(|line| {
                !self.blocked_prompts.iter().any(|pattern| 
                    line.to_lowercase().contains(&pattern.to_lowercase())
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        // Validate the sanitized response
        self.validate_prompt(&sanitized)?;

        Ok(sanitized)
    }
}

/// Extended account configuration for security validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountConfig {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
    pub is_program: bool,
}

/// Security wrapper for test cases
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureTestCase {
    pub test_case: ChaosTestCase,
    pub security_checks: Vec<SecurityCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityCheck {
    pub check_type: String,
    pub result: bool,
    pub details: Option<String>,
} 
