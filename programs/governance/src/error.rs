use anchor_lang::prelude::*;
use std::fmt;

pub type Result<T> = std::result::Result<T, GovernanceError>;

#[derive(Debug, Clone)]
pub struct ErrorContext {
    pub operation: String,
    pub message: String,
}

impl fmt::Display for ErrorContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.operation, self.message)
    }
}

pub trait WithErrorContext<T> {
    fn with_context(self, operation: &str, message: &str) -> Result<T>;
}

impl<T> WithErrorContext<T> for Result<T> {
    fn with_context(self, operation: &str, message: &str) -> Result<T> {
        self.map_err(|err| {
            msg!("Operation: {}, Message: {}", operation, message);
            err
        })
    }
}

pub fn create_error_context(operation: &str, message: &str) -> (String, String) {
    (operation.to_string(), message.to_string())
}

#[error_code]
pub enum GovernanceError {
    #[msg("Invalid governance configuration")]
    InvalidGovernanceConfig,
    #[msg("Invalid stake amount")]
    InvalidStakeAmount,
    #[msg("Insufficient stake balance")]
    InsufficientStake,
    #[msg("Account already halted")]
    AlreadyHalted,
    #[msg("Program is halted")]
    ProgramHalted,
    #[msg("Invalid rate limit")]
    InvalidRateLimit,
    #[msg("Invalid min stake")]
    InvalidMinStake,
    #[msg("Invalid voting period")]
    InvalidVotingPeriod,
    #[msg("Proposal rate limit exceeded")]
    ProposalRateLimitExceeded,
    #[msg("Quorum manipulation attempt")]
    QuorumManipulation,
    #[msg("Treasury exploit attempt")]
    TreasuryExploit,
    #[msg("Voting power manipulation")]
    VotingPowerManipulation,
    #[msg("Timelock bypass attempt")]
    TimelockBypass,
    #[msg("Proposal spam attempt")]
    ProposalSpam,
    #[msg("Flash loan attack attempt")]
    FlashLoanAttack,
    #[msg("Governance takeover attempt")]
    GovernanceTakeover,
    #[msg("Instruction injection attempt")]
    InstructionInjection,
    #[msg("Vote manipulation attempt")]
    VoteManipulation,
    #[msg("Execution manipulation attempt")]
    ExecutionManipulation,
    #[msg("State manipulation attempt")]
    StateManipulation,
    #[msg("Concurrent execution attempt")]
    ConcurrentExecution,
}

impl From<anchor_lang::error::Error> for GovernanceError {
    fn from(err: anchor_lang::error::Error) -> Self {
        msg!("Anchor error: {:?}", err);
        GovernanceError::InvalidParameters
    }
}

impl From<ProgramError> for GovernanceError {
    fn from(err: ProgramError) -> Self {
        msg!("Program error: {:?}", err);
        GovernanceError::InvalidParameters
    }
}

impl From<std::io::Error> for GovernanceError {
    fn from(err: std::io::Error) -> Self {
        msg!("IO error: {:?}", err);
        GovernanceError::InvalidParameters
    }
}

impl From<reqwest::Error> for GovernanceError {
    fn from(err: reqwest::Error) -> Self {
        msg!("HTTP client error: {:?}", err);
        GovernanceError::ClientError
    }
}

impl From<serde_json::Error> for GovernanceError {
    fn from(err: serde_json::Error) -> Self {
        msg!("JSON error: {:?}", err);
        GovernanceError::SerializationError
    }
}

impl From<&str> for GovernanceError {
    fn from(err: &str) -> Self {
        msg!("Error: {}", err);
        GovernanceError::InvalidAccountData
    }
}

impl From<mongodb::error::Error> for GovernanceError {
    fn from(err: mongodb::error::Error) -> Self {
        msg!("MongoDB error: {:?}", err);
        GovernanceError::DatabaseError
    }
}

impl From<redis::RedisError> for GovernanceError {
    fn from(err: redis::RedisError) -> Self {
        msg!("Redis error: {:?}", err);
        GovernanceError::RedisError
    }
} 