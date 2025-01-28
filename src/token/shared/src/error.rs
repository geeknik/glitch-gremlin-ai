use thiserror::Error;
use solana_program::program_error::ProgramError;

#[derive(Error, Debug)]
pub enum SharedError {
    #[error("Invalid security level")]
    InvalidSecurityLevel,
    
    #[error("Insufficient attestations")]
    InsufficientAttestations,
    
    #[error("Geographic diversity requirement not met")]
    InsufficientGeographicDiversity,
    
    #[error("Memory safety violation")]
    MemorySafetyViolation,
}

impl From<SharedError> for ProgramError {
    fn from(e: SharedError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

#[derive(Error, Debug)]
pub enum SecurityError {
    #[error("Hardware security module unavailable")]
    HardwareSecurityUnavailable,
    #[error("Insufficient system entropy")]
    InsufficientEntropy,
    #[error("Invalid security parameters")]
    InvalidSecurityParameters,
    #[error("Invalid attestation data")]
    InvalidAttestationData,
    #[error("Attestation failed")]
    AttestationFailed,
    #[error("Invalid security level")]
    InvalidSecurityLevel,
    #[error("Security check failed")]
    SecurityCheckFailed,
    #[error("Memory protection violation")]
    MemoryProtectionViolation,
    #[error("Invalid hardware diversity")]
    InvalidHardwareDiversity,
    #[error("Geographic diversity requirement not met")]
    InsufficientGeographicDiversity,
}

#[derive(Error, Debug)]
pub enum ValidationError {
    #[error("Invalid parameters provided")]
    InvalidParameters,
    #[error("Validation failed")]
    ValidationFailed,
    #[error("Insufficient coverage")]
    InsufficientCoverage,
    #[error("Invalid geographic proof")]
    InvalidGeographicProof,
    #[error("Resource limit exceeded")]
    ResourceLimitExceeded,
    #[error("Invalid validator count")]
    InvalidValidatorCount,
    #[error("Invalid hardware attestation")]
    InvalidHardwareAttestation,
    #[error("Entropy validation failed")]
    EntropyValidationFailed,
    #[error("Invalid proof of chaos")]
    InvalidProofOfChaos,
}

#[derive(Error, Debug)]
pub enum WorkerError {
    #[error("Not initialized")]
    NotInitialized,
    #[error("Already initialized")]
    AlreadyInitialized,
    #[error("Invalid owner")]
    InvalidOwner,
    #[error("Invalid worker")]
    InvalidWorker,
    #[error("Invalid instruction")]
    InvalidInstruction,
    #[error("Insufficient funds")]
    InsufficientFunds,
    #[error("Security error: {0}")]
    SecurityError(SecurityError),
    #[error("Validation error: {0}")]
    ValidationError(ValidationError),
    #[error("Serialization error: {0}")]
    SerializationError(#[from] std::io::Error),
    #[error("Program error: {0}")]
    ProgramError(#[from] ProgramError),
    #[error("Test setup error: {0}")]
    TestSetupError(String),
    #[error("Test execution error: {0}")]
    TestExecutionError(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Resource limit exceeded: {0}")]
    ResourceLimitExceeded(String),
    #[error("Hardware diversity error: {0}")]
    HardwareDiversityError(String),
    #[error("Geographic diversity error: {0}")]
    GeographicDiversityError(String),
    #[error("Attestation error: {0}")]
    AttestationError(String),
}

impl From<SecurityError> for ProgramError {
    fn from(e: SecurityError) -> Self {
        ProgramError::Custom(match e {
            SecurityError::HardwareSecurityUnavailable => 1000,
            SecurityError::InsufficientEntropy => 1001,
            SecurityError::InvalidSecurityParameters => 1002,
            SecurityError::InvalidAttestationData => 1003,
            SecurityError::AttestationFailed => 1004,
            SecurityError::InvalidSecurityLevel => 1005,
            SecurityError::SecurityCheckFailed => 1006,
            SecurityError::MemoryProtectionViolation => 1007,
            SecurityError::InvalidHardwareDiversity => 1008,
            SecurityError::InsufficientGeographicDiversity => 1009,
        })
    }
}

impl From<ValidationError> for ProgramError {
    fn from(e: ValidationError) -> Self {
        ProgramError::Custom(match e {
            ValidationError::InvalidParameters => 2000,
            ValidationError::ValidationFailed => 2001,
            ValidationError::InsufficientCoverage => 2002,
            ValidationError::InvalidGeographicProof => 2003,
            ValidationError::ResourceLimitExceeded => 2004,
            ValidationError::InvalidValidatorCount => 2005,
            ValidationError::InvalidHardwareAttestation => 2006,
            ValidationError::EntropyValidationFailed => 2007,
            ValidationError::InvalidProofOfChaos => 2008,
        })
    }
}

impl From<WorkerError> for ProgramError {
    fn from(e: WorkerError) -> Self {
        match e {
            WorkerError::NotInitialized => ProgramError::Custom(3000),
            WorkerError::AlreadyInitialized => ProgramError::Custom(3001),
            WorkerError::InvalidOwner => ProgramError::Custom(3002),
            WorkerError::InvalidWorker => ProgramError::Custom(3003),
            WorkerError::InvalidInstruction => ProgramError::Custom(3004),
            WorkerError::InsufficientFunds => ProgramError::Custom(3005),
            WorkerError::SecurityError(e) => e.into(),
            WorkerError::ValidationError(e) => e.into(),
            WorkerError::SerializationError(_) => ProgramError::Custom(3006),
            WorkerError::ProgramError(e) => e,
            WorkerError::TestSetupError(_) => ProgramError::Custom(3007),
            WorkerError::TestExecutionError(_) => ProgramError::Custom(3008),
            WorkerError::InvalidInput(_) => ProgramError::InvalidArgument,
            WorkerError::ResourceLimitExceeded(_) => ProgramError::Custom(3009),
            WorkerError::HardwareDiversityError(_) => ProgramError::Custom(3010),
            WorkerError::GeographicDiversityError(_) => ProgramError::Custom(3011),
            WorkerError::AttestationError(_) => ProgramError::Custom(3012),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_error_conversion() {
        let error = SecurityError::HardwareSecurityUnavailable;
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(1000));

        let error = SecurityError::InsufficientEntropy;
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(1001));
    }

    #[test]
    fn test_validation_error_conversion() {
        let error = ValidationError::InvalidParameters;
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(2000));

        let error = ValidationError::InvalidProofOfChaos;
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(2008));
    }

    #[test]
    fn test_worker_error_conversion() {
        let error = WorkerError::NotInitialized;
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(3000));

        let error = WorkerError::SecurityError(SecurityError::HardwareSecurityUnavailable);
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(1000));
    }
} 