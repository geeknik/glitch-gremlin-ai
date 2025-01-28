use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};
use borsh::{BorshSerialize, BorshDeserialize};
use sha2::{Sha256, Digest};
use crate::{
    error::GlitchError,
    state::{SecurityLevel, ValidationMode},
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ValidationReport {
    pub program_id: Pubkey,
    pub timestamp: i64,
    pub security_metrics: SecurityMetrics,
    pub vulnerabilities: Vec<Vulnerability>,
    pub attestations: Vec<Attestation>,
    pub report_hash: [u8; 32],
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct SecurityMetrics {
    pub vulnerability_density: f64,
    pub time_to_detection: i64,
    pub false_positive_rate: f64,
    pub false_negative_rate: f64,
    pub exploit_complexity_score: u8,
    pub attack_surface_area: f64,
    pub coverage_percentage: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Vulnerability {
    pub severity: VulnerabilitySeverity,
    pub category: VulnerabilityCategory,
    pub location: CodeLocation,
    pub exploit_chain: Vec<ExploitStep>,
    pub cvss_score: f32,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum VulnerabilitySeverity {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum VulnerabilityCategory {
    MemorySafety,
    RaceCondition,
    LogicError,
    PrivilegeEscalation,
    DataValidation,
    CryptographicFailure,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct CodeLocation {
    pub instruction_index: u64,
    pub offset: u32,
    pub context: String,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ExploitStep {
    pub description: String,
    pub preconditions: Vec<String>,
    pub technical_impact: String,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Attestation {
    pub validator_pubkey: Pubkey,
    pub timestamp: i64,
    pub signature: [u8; 64],
}

impl ValidationReport {
    pub fn new(
        program_id: Pubkey,
        security_metrics: SecurityMetrics,
        vulnerabilities: Vec<Vulnerability>,
        attestations: Vec<Attestation>,
    ) -> Result<Self, GlitchError> {
        let clock = Clock::get()?;
        
        let mut report = Self {
            program_id,
            timestamp: clock.unix_timestamp,
            security_metrics,
            vulnerabilities,
            attestations,
            report_hash: [0u8; 32],
        };

        // Generate report hash
        report.report_hash = report.calculate_hash();
        
        Ok(report)
    }

    fn calculate_hash(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        
        // Hash all report components
        hasher.update(self.program_id.as_ref());
        hasher.update(&self.timestamp.to_le_bytes());
        hasher.update(&self.security_metrics.vulnerability_density.to_le_bytes());
        
        for vuln in &self.vulnerabilities {
            hasher.update(&(vuln.cvss_score.to_le_bytes()));
        }
        
        for attestation in &self.attestations {
            hasher.update(attestation.validator_pubkey.as_ref());
            hasher.update(&attestation.signature);
        }

        hasher.finalize().into()
    }

    pub fn to_markdown(&self) -> String {
        let mut report = String::new();
        
        // Header
        report.push_str(&format!("# Security Validation Report\n\n"));
        report.push_str(&format!("Program: {}\n", self.program_id));
        report.push_str(&format!("Timestamp: {}\n\n", self.timestamp));
        
        // Security Metrics
        report.push_str("## Security Metrics\n\n");
        report.push_str(&format!("- Vulnerability Density: {:.2}\n", self.security_metrics.vulnerability_density));
        report.push_str(&format!("- Time to Detection: {}ms\n", self.security_metrics.time_to_detection));
        report.push_str(&format!("- Attack Surface Area: {:.2}\n", self.security_metrics.attack_surface_area));
        report.push_str(&format!("- Coverage: {}%\n\n", self.security_metrics.coverage_percentage));
        
        // Vulnerabilities
        report.push_str("## Vulnerabilities\n\n");
        for vuln in &self.vulnerabilities {
            report.push_str(&format!("### {:?} ({:.1} CVSS)\n", vuln.severity, vuln.cvss_score));
            report.push_str(&format!("Category: {:?}\n", vuln.category));
            report.push_str(&format!("Location: {}:{}\n", vuln.location.instruction_index, vuln.location.offset));
            report.push_str("Exploit Chain:\n");
            for step in &vuln.exploit_chain {
                report.push_str(&format!("1. {}\n", step.description));
            }
            report.push_str("\n");
        }
        
        // Attestations
        report.push_str("## Validator Attestations\n\n");
        for attestation in &self.attestations {
            report.push_str(&format!("- Validator: {}\n", attestation.validator_pubkey));
            report.push_str(&format!("  Timestamp: {}\n\n", attestation.timestamp));
        }
        
        report
    }
} 