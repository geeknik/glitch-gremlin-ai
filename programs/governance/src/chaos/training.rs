use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf};
use crate::chaos::security::{SecuritySanitizer, SecurityError};

/// Training data for ML models
#[derive(Debug, Serialize, Deserialize)]
pub struct TrainingData {
    pub contracts: Vec<ContractExample>,
    pub vulnerabilities: Vec<VulnerabilityPattern>,
    pub test_cases: Vec<TestCaseExample>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContractExample {
    pub name: String,
    pub code: String,
    pub classification: ContractClassification,
    pub vulnerabilities: Vec<String>,
    pub audit_results: Option<AuditResults>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ContractClassification {
    Secure,
    Vulnerable { severity: SecuritySeverity },
    Malicious,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum SecuritySeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VulnerabilityPattern {
    pub name: String,
    pub description: String,
    pub code_pattern: String,
    pub detection_rules: Vec<String>,
    pub examples: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestCaseExample {
    pub test_case: ChaosTestCase,
    pub result: ExecutionResult,
    pub found_vulnerabilities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditResults {
    pub auditor: String,
    pub date: chrono::DateTime<chrono::Utc>,
    pub findings: Vec<AuditFinding>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditFinding {
    pub severity: SecuritySeverity,
    pub title: String,
    pub description: String,
    pub location: String,
}

/// Manager for training data
pub struct TrainingManager {
    data: TrainingData,
    security: SecuritySanitizer,
    stats: TrainingStats,
}

#[derive(Debug, Default)]
pub struct TrainingStats {
    total_contracts: usize,
    secure_contracts: usize,
    vulnerable_contracts: usize,
    malicious_contracts: usize,
    vulnerability_patterns: HashMap<String, usize>,
}

impl TrainingManager {
    pub fn new(data_path: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let data: TrainingData = serde_json::from_str(
            &std::fs::read_to_string(data_path)?
        )?;

        let mut manager = Self {
            data,
            security: SecuritySanitizer::new(),
            stats: TrainingStats::default(),
        };

        // Validate and analyze training data
        manager.analyze_training_data()?;

        Ok(manager)
    }

    /// Analyze and validate training data
    fn analyze_training_data(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        for contract in &self.data.contracts {
            // Update statistics
            self.stats.total_contracts += 1;
            match &contract.classification {
                ContractClassification::Secure => self.stats.secure_contracts += 1,
                ContractClassification::Vulnerable { .. } => self.stats.vulnerable_contracts += 1,
                ContractClassification::Malicious => self.stats.malicious_contracts += 1,
            }

            // Track vulnerability patterns
            for vuln in &contract.vulnerabilities {
                *self.stats.vulnerability_patterns
                    .entry(vuln.clone())
                    .or_insert(0) += 1;
            }

            // Validate contract code
            self.validate_contract_code(&contract.code)?;
        }

        // Validate vulnerability patterns
        for pattern in &self.data.vulnerabilities {
            self.validate_vulnerability_pattern(pattern)?;
        }

        // Validate test cases
        for test_case in &self.data.test_cases {
            self.security.validate_test_case(&test_case.test_case)?;
        }

        Ok(())
    }

    /// Validate contract code for security issues
    fn validate_contract_code(&self, code: &str) -> Result<(), SecurityError> {
        // Check for unsafe patterns
        if code.contains("unsafe") {
            return Err(SecurityError::InvalidInstruction(
                "Unsafe code detected".to_string()
            ));
        }

        // Check for potential exploits
        if code.contains("asm") || code.contains("inline") {
            return Err(SecurityError::InvalidInstruction(
                "Potentially dangerous code constructs detected".to_string()
            ));
        }

        Ok(())
    }

    /// Validate vulnerability pattern
    fn validate_vulnerability_pattern(&self, pattern: &VulnerabilityPattern) -> Result<(), SecurityError> {
        // Validate pattern code
        self.validate_contract_code(&pattern.code_pattern)?;

        // Validate detection rules
        for rule in &pattern.detection_rules {
            if rule.contains("rm -rf") || rule.contains("format!") {
                return Err(SecurityError::InvalidInstruction(
                    "Invalid detection rule".to_string()
                ));
            }
        }

        Ok(())
    }

    /// Get training examples for AI
    pub fn get_training_examples(&self, count: usize) -> Vec<String> {
        let mut examples = Vec::new();

        // Mix of secure and vulnerable contracts
        for contract in self.data.contracts.iter().take(count) {
            examples.push(format!(
                "Contract: {}\nClassification: {:?}\nVulnerabilities: {}\nCode:\n{}",
                contract.name,
                contract.classification,
                contract.vulnerabilities.join(", "),
                contract.code
            ));
        }

        examples
    }

    /// Get vulnerability patterns for detection
    pub fn get_vulnerability_patterns(&self) -> Vec<&VulnerabilityPattern> {
        self.data.vulnerabilities.iter().collect()
    }

    /// Get test cases for specific vulnerability
    pub fn get_test_cases_for_vulnerability(&self, vulnerability: &str) -> Vec<&TestCaseExample> {
        self.data.test_cases
            .iter()
            .filter(|tc| tc.found_vulnerabilities.contains(&vulnerability.to_string()))
            .collect()
    }

    /// Get training statistics
    pub fn get_stats(&self) -> &TrainingStats {
        &self.stats
    }
} 