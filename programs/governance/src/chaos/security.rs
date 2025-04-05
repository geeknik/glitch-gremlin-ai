use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;
use bs58;

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
    ResourceLimitExceeded(String),
    #[error("Security context violation: {0}")]
    SecurityContextViolation(String),
    #[error("Invalid upgrade authority: {0}")]
    InvalidUpgradeAuthority(String),
    #[error("Upgrade time lock active: {0}")]
    UpgradeTimeLockActive(String),
    #[error("Insufficient approvals: {0}")]
    InufficientApprovals(String),
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
    // Trusted upgrade signers
    trusted_signers: HashSet<Pubkey>,
}

#[derive(Debug, Clone)]
pub struct ResourceLimits {
    pub max_memory_mb: u32,
    pub max_cpu_cores: u32,
    pub max_duration_secs: u64,
    pub max_compute_units: u64,
}

impl SecuritySanitizer {
    pub fn new() -> Self {
        let mut sanitizer = Self {
            trusted_programs: HashSet::new(),
            blocked_patterns: HashSet::new(),
            max_instruction_size: 1024,
            blocked_prompts: HashSet::new(),
            trusted_signers: HashSet::new(),
        };

        // Initialize security rules
        sanitizer.initialize_security_rules();
        sanitizer.load_trusted_roots();
        sanitizer
    }

    fn load_trusted_roots(&mut self) {
        let root_keys = env::var("UPGRADE_ROOT_KEYS")
            .unwrap_or_default()
            .split(',')
            .filter_map(|k| Pubkey::from_str(k).ok())
            .collect();
            
        self.trusted_signers = root_keys;
    }

    pub fn validate_upgrade_authority(
        &self,
        authority_data: &[u8],
        clock: i64,
        last_upgrade: i64
    ) -> Result<(), SecurityError> {
        let upgrade_authority: UpgradeAuthority = bincode::deserialize(authority_data)
            .map_err(|_| SecurityError::InvalidUpgradeAuthority("Invalid authority data".into()))?;

        if upgrade_authority.threshold != 7 || upgrade_authority.signers.len() != 10 {
            return Err(SecurityError::InvalidUpgradeAuthority(
                "Requires 7/10 multisig configuration".into()
            ));
        }

        let unique_count = upgrade_authority.signers
            .iter()
            .collect::<HashSet<_>>()
            .len();
            
        if unique_count < 5 {
            return Err(SecurityError::InvalidUpgradeAuthority(
                "Insufficient signer diversity".into()
            ));
        }

        if clock - last_upgrade < 72 * 3600 {
            return Err(SecurityError::UpgradeTimeLockActive(
                format!("{} hours remaining", (72 * 3600 - (clock - last_upgrade)) / 3600)
            ));
        }

        Ok(())
    }

    pub fn verify_upgrade_signatures(
        &self,
        signatures: &[Signature],
        message: &[u8],
        signers: &[Pubkey]
    ) -> Result<(), SecurityError> {
        let mut valid_sigs = 0;
        
        for sig in signatures {
            if signers.iter().any(|s| s.verify(message, sig)) {
                valid_sigs += 1;
            }
        }

        if valid_sigs < 7 {
            return Err(SecurityError::InsufficientApprovals(
                format!("{}/7 required signatures", valid_sigs)
            ));
        }

        Ok(())
    }

    pub fn check_instruction_firewall(&self, instruction_data: &[u8]) -> Result<(), SecurityError> {
        let blocked_cpi_targets = [
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "Stake11111111111111111111111111111111111111",
            "Sysvar1111111111111111111111111111111111111",
            "Vote111111111111111111111111111111111111111"
        ];
        
        if instruction_data.len() >= 32 {
            let program_id = &instruction_data[0..32];
            let program_id_str = bs58::encode(program_id).into_string();
            
            if blocked_cpi_targets.contains(&program_id_str.as_str()) {
                return Err(SecurityError::UntrustedProgram(
                    format!("Blocked CPI target: {}", program_id_str)
                ));
            }
        }
        
        let banned_patterns = &[
            vec![0x08, 0x00, 0x00, 0x00],
            vec![0x09, 0x00, 0x00, 0x00]  
        ];
        
        for pattern in banned_patterns {
            if instruction_data.windows(pattern.len()).any(|w| w == pattern) {
                return Err(SecurityError::InvalidInstruction(
                    "Blocked syscall pattern detected".to_string()
                ));
            }
        }
        
        Ok(())
    }

    pub fn enforce_resource_limits(&self, limits: &ResourceLimits) -> Result<(), SecurityError> {
        if limits.max_memory_mb > 2048 {
            return Err(SecurityError::ResourceLimitExceeded(
                format!("Memory limit exceeded: {}MB", limits.max_memory_mb)
            ));
        }
        
        if limits.max_cpu_cores > 1 {
            return Err(SecurityError::ResourceLimitExceeded(
                format!("CPU core limit exceeded: {}", limits.max_cpu_cores)
            ));
        }
        
        if limits.max_compute_units > 1_400_000 {
            return Err(SecurityError::ResourceLimitExceeded(
                format!("Compute units exceeded: {}", limits.max_compute_units)
            ));
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

#[derive(Serialize, Deserialize)]
struct UpgradeAuthority {
    threshold: u8,
    signers: Vec<Pubkey>,
    activation_delay: i64,
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
