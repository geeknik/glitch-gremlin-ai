use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;

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
}

impl SecuritySanitizer {
    pub fn new() -> Self {
        let mut sanitizer = Self {
            trusted_programs: HashSet::new(),
            blocked_patterns: HashSet::new(),
            max_instruction_size: 1024,
            blocked_prompts: HashSet::new(),
        };

        // Initialize security rules
        sanitizer.initialize_security_rules();
        sanitizer
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