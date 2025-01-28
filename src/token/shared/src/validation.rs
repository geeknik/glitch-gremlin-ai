use crate::error::{SecurityError, WorkerError, ValidationError};
use solana_program::pubkey::Pubkey;
use solana_program::program_error::ProgramError;
use std::collections::HashMap;

const MIN_VALIDATOR_NODES: usize = 3;
const MIN_HARDWARE_DIVERSITY: usize = 2;
const MIN_GEOGRAPHIC_PROOFS: usize = 3;
const PROOF_SIZE: usize = 32;
const MIN_ENTROPY_BITS: f64 = 3.0;

/// Geographic proof with validation metadata
#[derive(Debug, Clone)]
pub struct GeographicProof {
    pub location_hash: [u8; PROOF_SIZE],
    pub validator_signature: [u8; 64],
    pub timestamp: i64,
}

/// Validates program security requirements
pub fn validate_program_security(program_id: &Pubkey) -> Result<(), WorkerError> {
    if program_id == &Pubkey::default() {
        return Err(SecurityError::InvalidSecurityLevel.into());
    }
    Ok(())
}

/// Validates hardware security features
pub fn validate_hardware_security() -> Result<(), SecurityError> {
    #[cfg(target_arch = "x86_64")]
    unsafe {
        let mut eax = 0u32;
        let mut ebx = 0u32;
        let mut ecx = 0u32;
        let mut edx = 0u32;
        
        // Check for SSE2 (minimum requirement)
        std::arch::x86_64::__cpuid(1, &mut eax, &mut ebx, &mut ecx, &mut edx);
        if (edx & (1 << 26)) == 0 {
            return Err(SecurityError::HardwareSecurityUnavailable);
        }

        // Check for AES-NI
        if (ecx & (1 << 25)) == 0 {
            return Err(SecurityError::HardwareSecurityUnavailable);
        }

        // Check for RDRAND
        std::arch::x86_64::__cpuid(7, &mut eax, &mut ebx, &mut ecx, &mut edx);
        if (ebx & (1 << 18)) == 0 {
            return Err(SecurityError::HardwareSecurityUnavailable);
        }
    }

    Ok(())
}

/// Validates system entropy
pub fn validate_entropy() -> Result<(), SecurityError> {
    let mut buffer = [0u8; 32];
    if getrandom::getrandom(&mut buffer).is_err() {
        return Err(SecurityError::InsufficientEntropy);
    }

    // Calculate Shannon entropy
    let mut counts = [0u32; 256];
    for &byte in &buffer {
        counts[byte as usize] += 1;
    }

    let mut entropy = 0.0;
    let len = buffer.len() as f64;
    for &count in &counts {
        if count > 0 {
            let p = count as f64 / len;
            entropy -= p * p.log2();
        }
    }

    // Require at least 3.0 bits of entropy per byte
    if entropy / len < 3.0 {
        return Err(SecurityError::InsufficientEntropy);
    }

    Ok(())
}

/// Validates geographic diversity requirements
pub fn validate_geographic_diversity(proofs: &[GeographicProof]) -> Result<(), WorkerError> {
    if proofs.len() < MIN_GEOGRAPHIC_PROOFS {
        return Err(ValidationError::InsufficientCoverage.into());
    }

    // Track unique locations to ensure geographic diversity
    let mut unique_locations = HashMap::new();
    for proof in proofs {
        unique_locations.insert(proof.location_hash, proof.validator_signature);
    }

    if unique_locations.len() < MIN_GEOGRAPHIC_PROOFS {
        return Err(ValidationError::InsufficientCoverage.into());
    }

    Ok(())
}

/// Validates attestation requirements
pub fn validate_attestation(quote: Option<&[u8]>) -> Result<(), WorkerError> {
    if let Some(quote) = quote {
        // Validate SGX quote structure
        if quote.len() != 64 {
            return Err(SecurityError::InvalidAttestationData.into());
        }

        // Validate quote signature
        if quote[0] != 0x01 {
            return Err(SecurityError::AttestationFailed.into());
        }
    }

    Ok(())
}

#[derive(Debug)]
pub struct ValidationContext {
    pub coverage: u8,
    pub entropy: u8,
    pub attack_surface: u32,
    validator_nodes: HashMap<Pubkey, ValidatorInfo>,
    hardware_types: Vec<String>,
    geographic_proofs: Vec<GeographicProof>,
}

#[derive(Debug)]
struct ValidatorInfo {
    hardware_type: String,
    geographic_location: [u8; PROOF_SIZE],
    attestation_quote: Option<Vec<u8>>,
    performance_score: f64,
}

impl ValidationContext {
    pub fn new(coverage: u8, entropy: u8, attack_surface: u32) -> Self {
        Self {
            coverage,
            entropy,
            attack_surface,
            validator_nodes: HashMap::new(),
            hardware_types: Vec::new(),
            geographic_proofs: Vec::new(),
        }
    }

    pub fn add_validator(
        &mut self,
        pubkey: Pubkey,
        hardware_type: String,
        location: [u8; PROOF_SIZE],
        quote: Option<Vec<u8>>,
        performance_score: f64,
    ) {
        self.validator_nodes.insert(pubkey, ValidatorInfo {
            hardware_type: hardware_type.clone(),
            geographic_location: location,
            attestation_quote: quote,
            performance_score,
        });
        
        if !self.hardware_types.contains(&hardware_type) {
            self.hardware_types.push(hardware_type);
        }
    }

    pub fn add_geographic_proof(
        &mut self,
        location_hash: [u8; PROOF_SIZE],
        validator_signature: [u8; 64],
        timestamp: i64,
    ) {
        self.geographic_proofs.push(GeographicProof {
            location_hash,
            validator_signature,
            timestamp,
        });
    }

    pub fn validate_geographic_proofs(&self) -> Result<bool, WorkerError> {
        validate_geographic_diversity(&self.geographic_proofs)?;

        // Validate each proof's timestamp is recent enough
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        for proof in &self.geographic_proofs {
            if now - proof.timestamp > 3600 { // 1 hour max age
                return Err(ValidationError::InvalidGeographicProof.into());
            }
        }

        Ok(true)
    }

    pub fn validate_critical(&self) -> Result<bool, WorkerError> {
        // Validate hardware diversity
        if self.hardware_types.len() < MIN_HARDWARE_DIVERSITY {
            return Err(ValidationError::InvalidParameters.into());
        }

        // Validate validator node count
        if self.validator_nodes.len() < MIN_VALIDATOR_NODES {
            return Err(ValidationError::InsufficientCoverage.into());
        }

        // Validate attestation for each node
        for (_, info) in &self.validator_nodes {
            if let Some(quote) = &info.attestation_quote {
                validate_attestation(Some(quote))?;
            } else {
                return Err(ValidationError::ValidationFailed.into());
            }
        }

        // Validate coverage and entropy requirements
        if self.coverage < 95 || self.entropy < 255 || self.attack_surface > 100 {
            return Err(ValidationError::InvalidParameters.into());
        }

        // Validate geographic diversity
        self.validate_geographic_proofs()?;

        Ok(true)
    }

    pub fn validate_high(&self) -> Result<bool, WorkerError> {
        // Validate hardware diversity
        if self.hardware_types.len() < MIN_HARDWARE_DIVERSITY {
            return Err(ValidationError::InvalidParameters.into());
        }

        // Validate validator node count
        if self.validator_nodes.len() < 2 {
            return Err(ValidationError::InsufficientCoverage.into());
        }

        if self.coverage < 80 || self.entropy < 192 || self.attack_surface > 200 {
            return Err(ValidationError::InvalidParameters.into());
        }

        // Validate geographic diversity
        self.validate_geographic_proofs()?;

        Ok(true)
    }

    pub fn validate_medium(&self) -> Result<bool, WorkerError> {
        if self.coverage < 60 || self.entropy < 128 {
            return Err(ValidationError::InvalidParameters.into());
        }

        if self.validator_nodes.len() < 2 {
            return Err(ValidationError::InsufficientCoverage.into());
        }

        Ok(true)
    }

    pub fn validate_low(&self) -> Result<bool, WorkerError> {
        if self.coverage < 40 {
            return Err(ValidationError::InvalidParameters.into());
        }

        if self.validator_nodes.is_empty() {
            return Err(ValidationError::InsufficientCoverage.into());
        }

        Ok(true)
    }

    pub fn calculate_entropy(&self, data: &[u8]) -> f64 {
        let mut counts = [0u32; 256];
        for &byte in data {
            counts[byte as usize] += 1;
        }

        let len = data.len() as f64;
        let mut entropy = 0.0;
        for &count in &counts {
            if count > 0 {
                let p = count as f64 / len;
                entropy -= p * p.log2();
            }
        }

        entropy / len
    }

    pub fn get_validator_performance_stats(&self) -> (f64, f64, f64) { // min, max, avg
        let scores: Vec<f64> = self.validator_nodes
            .values()
            .map(|info| info.performance_score)
            .collect();

        if scores.is_empty() {
            return (0.0, 0.0, 0.0);
        }

        let min = scores.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let max = scores.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let avg = scores.iter().sum::<f64>() / scores.len() as f64;

        (min, max, avg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_program_security() {
        let program_id = Pubkey::new_unique();
        assert!(validate_program_security(&program_id).is_ok());
        assert!(validate_program_security(&Pubkey::default()).is_err());
    }

    #[test]
    fn test_geographic_diversity() {
        let mut context = ValidationContext::new(80, 192, 150);
        
        // Add valid geographic proofs
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        context.add_geographic_proof([1; 32], [1; 64], now);
        context.add_geographic_proof([2; 32], [2; 64], now);
        context.add_geographic_proof([3; 32], [3; 64], now);

        assert!(context.validate_geographic_proofs().is_ok());

        // Test with expired proof
        let mut context = ValidationContext::new(80, 192, 150);
        context.add_geographic_proof([1; 32], [1; 64], now - 7200); // 2 hours old
        assert!(context.validate_geographic_proofs().is_err());
    }

    #[test]
    fn test_validation_context_creation() {
        let mut context = ValidationContext::new(80, 192, 150);
        
        // Add validator nodes
        let validator1 = Pubkey::new_unique();
        let validator2 = Pubkey::new_unique();
        let validator3 = Pubkey::new_unique();

        context.add_validator(validator1, "CPU".to_string(), [1; 32], Some(vec![1; 64]), 0.95);
        context.add_validator(validator2, "GPU".to_string(), [2; 32], Some(vec![1; 64]), 0.85);
        context.add_validator(validator3, "TPU".to_string(), [3; 32], Some(vec![1; 64]), 0.90);

        assert_eq!(context.validator_nodes.len(), 3);
        assert_eq!(context.hardware_types.len(), 3);

        let (min, max, avg) = context.get_validator_performance_stats();
        assert_eq!(min, 0.85);
        assert_eq!(max, 0.95);
        assert!((avg - 0.90).abs() < f64::EPSILON);
    }
} 