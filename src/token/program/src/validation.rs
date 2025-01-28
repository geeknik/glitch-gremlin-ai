use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    msg,
};
use sha2::{Sha256, Digest};
use crate::{
    error::GlitchError,
    state::{SecurityLevel, TestParams},
};

pub fn assert_owned_by(account: &AccountInfo, owner: &Pubkey) -> Result<(), ProgramError> {
    if account.owner != owner {
        return Err(GlitchError::InvalidTokenAccount.into());
    }
    Ok(())
}

pub fn assert_rent_exempt(rent: &Rent, account: &AccountInfo) -> Result<(), ProgramError> {
    if !rent.is_exempt(account.lamports(), account.data_len()) {
        return Err(GlitchError::NotRentExempt.into());
    }
    Ok(())
}

pub fn assert_signer(account: &AccountInfo) -> Result<(), ProgramError> {
    if !account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

pub fn assert_uninitialized(account: &AccountInfo) -> Result<(), ProgramError> {
    if !account.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    Ok(())
}

pub const MIN_ENTROPY_SCORE: u8 = 80;
pub const MIN_COVERAGE_PERCENT: u8 = 85;
pub const MAX_VULNERABILITY_DENSITY: f32 = 0.05; // 5% max vulnerability density

#[derive(Debug)]
pub struct ValidationEngine {
    pub security_level: SecurityLevel,
    pub test_params: TestParams,
    pub attestation_manager: AttestationManager,
    pub vulnerability_metrics: VulnerabilityMetrics,
}

#[derive(Debug)]
pub struct VulnerabilityMetrics {
    pub vulnerability_density: f32,
    pub time_to_detection: u32,
    pub false_positives: u32,
    pub false_negatives: u32,
    pub exploit_complexity: u8,
}

#[derive(Debug)]
pub struct AttestationManager {
    attestations: Vec<(Pubkey, [u8; 64])>, // (validator_key, signature)
}

impl ValidationEngine {
    pub fn new(security_level: SecurityLevel, test_params: TestParams) -> Self {
        Self {
            security_level,
            test_params,
            attestation_manager: AttestationManager::new(),
            vulnerability_metrics: VulnerabilityMetrics {
                vulnerability_density: 0.0,
                time_to_detection: 0,
                false_positives: 0,
                false_negatives: 0,
                exploit_complexity: 0,
            },
        }
    }

    pub fn validate_results(&self, results: &[u8]) -> Result<bool, ProgramError> {
        // Calculate metrics
        let coverage = self.calculate_coverage(results)?;
        let entropy_score = self.calculate_entropy_score(results);
        let attack_surface = self.calculate_attack_surface(results);
        
        // Validate based on security level
        match self.security_level {
            SecurityLevel::Critical => self.validate_critical(results, coverage, entropy_score, attack_surface),
            SecurityLevel::High => self.validate_high(results, coverage, entropy_score, attack_surface),
            SecurityLevel::Medium => self.validate_medium(results, coverage, entropy_score),
            SecurityLevel::Low => self.validate_low(results, coverage),
        }
    }

    fn validate_critical(&self, results: &[u8], coverage: u8, entropy: u8, attack_surface: u32) -> Result<bool, ProgramError> {
        // Critical security requires highest standards
        if coverage < 95 || entropy < 90 || attack_surface > 100 || 
           self.vulnerability_metrics.vulnerability_density > 0.01 {
            msg!("Critical validation failed: coverage={}, entropy={}, attack_surface={}", 
                coverage, entropy, attack_surface);
            return Ok(false);
        }
        
        // Verify all required attestations
        if self.attestation_manager.attestations.len() < self.test_params.min_validators as usize {
            msg!("Insufficient validator attestations");
            return Ok(false);
        }

        Ok(true)
    }

    fn validate_high(&self, results: &[u8], coverage: u8, entropy: u8, attack_surface: u32) -> Result<bool, ProgramError> {
        if coverage < 90 || entropy < 85 || attack_surface > 200 ||
           self.vulnerability_metrics.vulnerability_density > 0.02 {
            msg!("High validation failed: coverage={}, entropy={}, attack_surface={}", 
                coverage, entropy, attack_surface);
            return Ok(false);
        }
        Ok(true)
    }

    fn validate_medium(&self, results: &[u8], coverage: u8, entropy: u8) -> Result<bool, ProgramError> {
        if coverage < 85 || entropy < 80 ||
           self.vulnerability_metrics.vulnerability_density > 0.03 {
            msg!("Medium validation failed: coverage={}, entropy={}", coverage, entropy);
            return Ok(false);
        }
        Ok(true)
    }

    fn validate_low(&self, results: &[u8], coverage: u8) -> Result<bool, ProgramError> {
        if coverage < 80 || self.vulnerability_metrics.vulnerability_density > 0.05 {
            msg!("Low validation failed: coverage={}", coverage);
            return Ok(false);
        }
        Ok(true)
    }

    fn calculate_coverage(&self, results: &[u8]) -> Result<u8, ProgramError> {
        if results.len() < 8 {
            return Err(ProgramError::InvalidInstructionData);
        }
        
        // Extract coverage metrics from results
        let total_lines = u32::from_le_bytes(results[0..4].try_into().unwrap());
        let covered_lines = u32::from_le_bytes(results[4..8].try_into().unwrap());
        
        if total_lines == 0 {
            return Err(ProgramError::InvalidInstructionData);
        }
        
        Ok(((covered_lines as f32 / total_lines as f32) * 100.0) as u8)
    }

    fn calculate_entropy_score(&self, results: &[u8]) -> u8 {
        let mut counts = [0u32; 256];
        for &byte in results {
            counts[byte as usize] += 1;
        }
        
        let len = results.len() as f32;
        let mut entropy = 0.0;
        
        for &count in counts.iter() {
            if count > 0 {
                let p = count as f32 / len;
                entropy -= p * p.log2();
            }
        }
        
        // Normalize to 0-100 range
        ((entropy / 8.0) * 100.0) as u8
    }

    fn calculate_attack_surface(&self, results: &[u8]) -> u32 {
        // Calculate attack surface based on:
        // 1. Number of external interfaces
        // 2. Number of privileged operations
        // 3. Data exposure points
        let interfaces = results.windows(4)
            .filter(|w| w == b"API_" || w == b"RPC_")
            .count();
            
        let privileged_ops = results.windows(4)
            .filter(|w| w == b"ROOT" || w == b"SUDO")
            .count();
            
        let data_points = results.windows(4)
            .filter(|w| w == b"DATA")
            .count();
            
        (interfaces + privileged_ops * 2 + data_points) as u32
    }
}

impl AttestationManager {
    pub fn new() -> Self {
        Self {
            attestations: Vec::new()
        }
    }

    pub fn add_validator_attestation(
        &mut self,
        validator_key: Pubkey,
        signature: [u8; 64]
    ) -> Result<(), ProgramError> {
        self.attestations.push((validator_key, signature));
        Ok(())
    }

    pub fn get_validator_attestations(&self) -> &Vec<(Pubkey, [u8; 64])> {
        &self.attestations
    }
}

impl ValidationEngine {
    pub fn validate_test_params(
        params: &TestParams,
        security_level: SecurityLevel,
    ) -> Result<(), ProgramError> {
        match security_level {
            SecurityLevel::Critical => {
                if !params.attestation_required {
                    return Err(GlitchError::InvalidChaosParameters.into());
                }
                if !params.memory_fence_required {
                    return Err(GlitchError::MemorySafetyViolation.into());
                }
                if params.min_validators < 3 {
                    return Err(GlitchError::InsufficientSignatures.into());
                }
            },
            SecurityLevel::High => {
                if !params.memory_fence_required {
                    return Err(GlitchError::MemorySafetyViolation.into());
                }
                if params.min_validators < 2 {
                    return Err(GlitchError::InsufficientSignatures.into());
                }
            },
            _ => {}
        }
        Ok(())
    }

    pub fn validate_geographic_proof(
        _proof: &[u8],
        _min_regions: u8,
    ) -> Result<(), ProgramError> {
        Ok(())
    }

    pub fn validate_attestation(
        _attestation: &[u8],
        _authority: &Pubkey,
    ) -> Result<(), ProgramError> {
        Ok(())
    }

    pub fn analyze_entry_points(&self, _results: &[u8]) -> f64 {
        // TODO: Implement entry point analysis
        0.0
    }

    pub fn analyze_privileged_ops(&self, _results: &[u8]) -> f64 {
        // TODO: Implement privileged operations analysis
        0.0
    }

    pub fn analyze_data_flow(&self, _results: &[u8]) -> f64 {
        // TODO: Implement data flow analysis
        0.0
    }

    pub fn get_total_instructions(&self) -> Result<u64, ProgramError> {
        Ok(self.test_params.test_duration)
    }

    pub fn get_covered_instructions(&self) -> Result<u64, ProgramError> {
        Ok(self.test_params.min_coverage as u64)
    }

    pub fn find_vulnerable_instruction(&self) -> Result<u64, GlitchError> {
        // Implementation would analyze test results to find vulnerable instruction
        Ok(0)
    }

    pub fn calculate_instruction_offset(&self) -> Result<u32, ProgramError> {
        // TODO: Implement instruction offset calculation
        Ok(0)
    }
}

#[derive(Debug)]
pub struct ValidationResults {
    pub attack_surface_area: u32,
    pub vulnerability_density: u8,
    pub time_to_detection: u8,
    pub false_positives: u8,
    pub false_negatives: u8,
    pub exploit_complexity_score: u8,
    pub total_instructions: u64,
    pub covered_instructions: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_test_params() {
        let params = TestParams {
            max_duration_seconds: 3600,
            min_validators: 3,
            min_stake_required: 1000,
            min_geographic_regions: 2,
            attestation_required: true,
            memory_fence_required: true,
            entropy_checks: true,
        };

        assert!(ValidationEngine::validate_test_params(&params, SecurityLevel::Critical).is_ok());
    }

    #[test]
    fn test_validation_high_security() {
        let engine = ValidationEngine::new(SecurityLevel::High, TestParams::default());
        assert!(engine.validate_results(&[0; 32]).is_err());
    }

    #[test]
    fn test_validation_low_security() {
        let engine = ValidationEngine::new(SecurityLevel::Low, TestParams::default());
        assert!(engine.validate_results(&[0; 32]).is_err());
    }

    #[test]
    fn test_validation_engine() {
        let test_params = TestParams {
            security_level: SecurityLevel::High,
            min_validators: 3,
            min_coverage: 90,
            max_vulnerability_density: 0.02,
            test_duration: 3600,
        };

        let engine = ValidationEngine::new(SecurityLevel::High, test_params);
        
        // Test results with 90% coverage
        let mut results = vec![0u8; 16];
        results[0..4].copy_from_slice(&100u32.to_le_bytes()); // total_lines
        results[4..8].copy_from_slice(&90u32.to_le_bytes());  // covered_lines
        
        let validation = engine.validate_results(&results);
        assert!(validation.is_ok());
    }

    #[test]
    fn test_attack_surface_calculation() {
        let engine = ValidationEngine::new(
            SecurityLevel::High,
            TestParams::default()
        );
        
        let results = b"API_test_RPC_endpoint_DATA_store";
        let attack_surface = engine.calculate_attack_surface(results);
        
        assert!(attack_surface > 0);
    }
} 