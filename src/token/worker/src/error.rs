use thiserror::Error;
use solana_program::program_error::ProgramError;
use std::io;

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
    SecurityError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(#[from] io::Error),
    
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

impl From<WorkerError> for ProgramError {
    fn from(e: WorkerError) -> Self {
        match e {
            WorkerError::NotInitialized => ProgramError::Custom(3000),
            WorkerError::AlreadyInitialized => ProgramError::Custom(3001),
            WorkerError::InvalidOwner => ProgramError::Custom(3002),
            WorkerError::InvalidWorker => ProgramError::Custom(3003),
            WorkerError::InvalidInstruction => ProgramError::Custom(3004),
            WorkerError::InsufficientFunds => ProgramError::Custom(3005),
            WorkerError::SecurityError(_) => ProgramError::Custom(3006),
            WorkerError::ValidationError(_) => ProgramError::Custom(3007),
            WorkerError::SerializationError(_) => ProgramError::Custom(3008),
            WorkerError::ProgramError(e) => e,
            WorkerError::TestSetupError(_) => ProgramError::Custom(3009),
            WorkerError::TestExecutionError(_) => ProgramError::Custom(3010),
            WorkerError::InvalidInput(_) => ProgramError::InvalidArgument,
            WorkerError::ResourceLimitExceeded(_) => ProgramError::Custom(3011),
            WorkerError::HardwareDiversityError(_) => ProgramError::Custom(3012),
            WorkerError::GeographicDiversityError(_) => ProgramError::Custom(3013),
            WorkerError::AttestationError(_) => ProgramError::Custom(3014),
        }
    }
}

#[derive(Error, Debug)]
pub enum SecurityError {
    #[error("Hardware security module unavailable")]
    HardwareSecurityUnavailable,
    
    #[error("Insufficient entropy")]
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

impl From<SecurityError> for WorkerError {
    fn from(e: SecurityError) -> Self {
        WorkerError::SecurityError(e.to_string())
    }
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

impl From<ValidationError> for WorkerError {
    fn from(e: ValidationError) -> Self {
        WorkerError::ValidationError(e.to_string())
    }
} 