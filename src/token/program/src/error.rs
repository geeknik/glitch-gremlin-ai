use solana_program::{
    program_error::ProgramError,
    msg,
};
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum GlitchError {
    #[error("Invalid instruction: The provided instruction is not recognized or malformed")]
    InvalidInstruction,

    #[error("Invalid account owner: Account owner does not match expected authority")]
    InvalidAccountOwner,

    #[error("Invalid signature: Transaction signature verification failed or missing required signature")]
    InvalidSignature,

    #[error("Invalid attestation: The provided attestation proof is invalid or expired")]
    InvalidAttestation,

    #[error("Invalid geographic proof: Geographic distribution requirements not met - insufficient validator diversity")]
    InvalidGeographicProof,

    #[error("Invalid SGX quote: The provided SGX quote is invalid, expired, or does not meet security requirements")]
    InvalidSGXQuote,

    #[error("Invalid security level: The specified security level is not supported or insufficient for operation")]
    InvalidSecurityLevel,

    #[error("Invalid test parameters: One or more test parameters are invalid or out of acceptable range")]
    InvalidTestParams,

    #[error("Invalid proposal: The governance proposal is invalid or malformed")]
    InvalidProposal,

    #[error("Invalid vote: The vote cast is invalid, unauthorized, or already processed")]
    InvalidVote,

    #[error("Proposal not executable: The proposal cannot be executed due to current state or conditions")]
    ProposalNotExecutable,

    #[error("Already voted: This account has already cast a vote on this proposal")]
    AlreadyVoted,

    #[error("Proposal cooldown not met: Must wait for cooldown period ({PROPOSAL_COOLDOWN} seconds) to end")]
    ProposalCooldownNotMet,

    #[error("Insufficient stake: The staked amount ({MIN_STAKE_AMOUNT} required) is below threshold")]
    InsufficientStake,

    #[error("Rate limit exceeded: Too many requests in current time window. Try again later")]
    RateLimitExceeded,

    #[error("Memory fence violation: Required memory safety checks failed - potential security risk")]
    MemoryFenceViolation,

    #[error("Entropy check failed: Required entropy pattern not found - potential randomness issue")]
    EntropyCheckFailed,

    #[error("Geographic distribution not met: Validator distribution requirements not satisfied - need more regions")]
    GeographicDistributionNotMet,

    #[error("Validator count not met: Insufficient number of validators for operation")]
    ValidatorCountNotMet,

    #[error("Program paused: The program is temporarily paused for maintenance or security")]
    ProgramPaused,

    #[error("Invalid account data: The account data is malformed or corrupted")]
    InvalidAccountData,

    #[error("Invalid token account: The provided token account is invalid or unauthorized")]
    InvalidTokenAccount,

    #[error("Not rent exempt: The account must be rent exempt to proceed")]
    NotRentExempt,

    #[error("Invalid chaos parameters: The chaos test parameters are invalid or unsafe")]
    InvalidChaosParameters,

    #[error("Invalid request status: The request is in an invalid state for this operation")]
    InvalidRequestStatus,

    #[error("Invalid target program: The specified target program is invalid or unauthorized")]
    InvalidTargetProgram,

    #[error("Invalid proof: The provided proof is invalid, malformed, or expired")]
    InvalidProof,

    #[error("Invalid entropy pattern: The entropy pattern does not meet security requirements")]
    InvalidEntropyPattern,

    #[error("Invalid request: The request is malformed or contains invalid parameters")]
    InvalidRequest,

    #[error("Security error: A security violation has occurred - operation aborted")]
    SecurityError,

    #[error("Insufficient signatures: Not enough valid signatures provided ({MIN_SIGNATURES} required)")]
    InsufficientSignatures,

    #[error("Invalid amount: The specified amount is invalid or exceeds limits")]
    InvalidAmount,

    #[error("Invalid authority: The authority is not authorized for this operation")]
    InvalidAuthority,

    #[error("Invalid mint: The mint account is invalid or unauthorized")]
    InvalidMint,

    #[error("Memory safety violation: A critical memory safety check failed - potential exploit attempt")]
    MemorySafetyViolation,
}

// Constants for error messages
const MIN_STAKE_AMOUNT: u64 = 1_000_000;
const PROPOSAL_COOLDOWN: i64 = 24 * 60 * 60; // 24 hours
const MIN_SIGNATURES: u8 = 3;

impl From<GlitchError> for ProgramError {
    fn from(e: GlitchError) -> Self {
        msg!("Glitch error: {}", e);
        ProgramError::Custom(e as u32)
    }
}

pub type GlitchResult<T> = Result<T, GlitchError>;

// Helper functions for common error checks
pub mod error_checks {
    use super::*;
    use solana_program::clock::Clock;
    use crate::state::{SecurityLevel, TestParams};

    pub fn validate_security_requirements(
        security_level: SecurityLevel,
        test_params: &TestParams,
        attestation_proof: Option<&[u8]>,
    ) -> GlitchResult<()> {
        match security_level {
            SecurityLevel::High | SecurityLevel::Critical => {
                if attestation_proof.is_none() {
                    return Err(GlitchError::InvalidAttestation);
                }
                if !test_params.memory_fence_required {
                    return Err(GlitchError::MemoryFenceViolation);
                }
            },
            _ => {}
        }
        Ok(())
    }

    pub fn validate_execution_delay(
        proposal_created_at: i64,
        execution_delay: u64,
        clock: &Clock,
    ) -> GlitchResult<()> {
        if clock.unix_timestamp < proposal_created_at + execution_delay as i64 {
            return Err(GlitchError::ProposalCooldownNotMet);
        }
        Ok(())
    }

    pub fn validate_stake_amount(
        stake_amount: u64,
        security_level: SecurityLevel,
    ) -> GlitchResult<()> {
        let min_stake = match security_level {
            SecurityLevel::Low => 1000,
            SecurityLevel::Medium => 5000,
            SecurityLevel::High => 10000,
            SecurityLevel::Critical => 50000,
        };

        if stake_amount < min_stake {
            return Err(GlitchError::InsufficientStake);
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum WorkerError {
    SecurityError(String),
    RateLimitExceeded(String),
    InvalidInput(String),
    ComputeExceeded(String),
    MemoryExceeded(String),
    IoError(String),
    NetworkError(String),
}

impl From<WorkerError> for ProgramError {
    fn from(e: WorkerError) -> Self {
        match e {
            WorkerError::SecurityError(_) => GlitchError::SecurityError.into(),
            WorkerError::RateLimitExceeded(_) => GlitchError::RateLimitExceeded.into(),
            WorkerError::InvalidInput(_) => GlitchError::InvalidInstruction.into(),
            WorkerError::ComputeExceeded(_) => ProgramError::Custom(1),
            WorkerError::MemoryExceeded(_) => GlitchError::MemoryFenceViolation.into(),
            WorkerError::IoError(_) => ProgramError::Custom(2),
            WorkerError::NetworkError(_) => ProgramError::Custom(3),
        }
    }
}

impl From<ProgramError> for GlitchError {
    fn from(err: ProgramError) -> Self {
        match err {
            ProgramError::Custom(code) => match code {
                0 => GlitchError::InvalidInstruction,
                1 => GlitchError::InvalidSignature,
                2 => GlitchError::InvalidAccountOwner,
                3 => GlitchError::InvalidAccountData,
                4 => GlitchError::InvalidSecurityLevel,
                5 => GlitchError::InvalidTestParams,
                6 => GlitchError::InvalidProposal,
                7 => GlitchError::InvalidVote,
                8 => GlitchError::ProposalNotExecutable,
                9 => GlitchError::AlreadyVoted,
                10 => GlitchError::ProposalCooldownNotMet,
                11 => GlitchError::InsufficientStake,
                12 => GlitchError::RateLimitExceeded,
                13 => GlitchError::MemoryFenceViolation,
                14 => GlitchError::EntropyCheckFailed,
                15 => GlitchError::GeographicDistributionNotMet,
                16 => GlitchError::ValidatorCountNotMet,
                17 => GlitchError::ProgramPaused,
                18 => GlitchError::InvalidAccountData,
                _ => GlitchError::InvalidInstruction,
            },
            _ => GlitchError::InvalidInstruction,
        }
    }
}

pub trait ErrorTracking {
    fn track_error(&self, error: &GlitchError);
    fn get_error_count(&self, error: &GlitchError) -> u32;
}

impl ErrorTracking for GlitchError {
    fn track_error(&self, _error: &GlitchError) {
        // Implementation to be added
    }

    fn get_error_count(&self, _error: &GlitchError) -> u32 {
        // Implementation to be added
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_conversion() {
        let error = GlitchError::InvalidInstruction;
        let program_error: ProgramError = error.into();
        assert_eq!(program_error, ProgramError::Custom(0));
    }

    #[test]
    fn test_error_messages() {
        assert_eq!(
            GlitchError::InvalidInstruction.to_string(),
            "Invalid instruction"
        );
        assert_eq!(
            GlitchError::InvalidSignature.to_string(),
            "Invalid signature"
        );
        assert_eq!(
            GlitchError::ProgramPaused.to_string(),
            "Program paused"
        );
    }
}
