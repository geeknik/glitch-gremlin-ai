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
    #[msg("The account has not been initialized")]
    UninitializedAccount,

    #[msg("Arithmetic operation overflow")]
    ArithmeticError,

    #[msg("Invalid proposal state")]
    InvalidProposalState,

    #[msg("Proposal not found")]
    ProposalNotFound,

    #[msg("Vote not found")]
    VoteNotFound,

    #[msg("Voting has ended")]
    VotingEnded,

    #[msg("User has already voted")]
    AlreadyVoted,

    #[msg("Invalid metrics")]
    InvalidMetrics,

    #[msg("Invalid parameters")]
    InvalidParameters,

    #[msg("Insufficient stake")]
    InsufficientStake,

    #[msg("Invalid stake amount")]
    InvalidStakeAmount,

    #[msg("Account is already delegated")]
    AlreadyDelegated,

    #[msg("Circuit breaker triggered")]
    CircuitBreakerTriggered,

    #[msg("Configuration error")]
    ConfigError,

    #[msg("Client error")]
    ClientError,

    #[msg("Alert error")]
    AlertError,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Invalid instruction data")]
    InvalidInstructionData,

    #[msg("Invalid account data")]
    InvalidAccountData,

    #[msg("Invalid owner")]
    InvalidOwner,

    #[msg("Not enough funds")]
    NotEnoughFunds,

    #[msg("Math overflow")]
    MathOverflow,
}

impl From<anchor_lang::error::Error> for GovernanceError {
    fn from(err: anchor_lang::error::Error) -> Self {
        msg!("Anchor error: {:?}", err);
        GovernanceError::InvalidInstructionData
    }
}

impl From<ProgramError> for GovernanceError {
    fn from(err: ProgramError) -> Self {
        msg!("Program error: {:?}", err);
        GovernanceError::InvalidInstructionData
    }
}

impl From<std::io::Error> for GovernanceError {
    fn from(err: std::io::Error) -> Self {
        msg!("IO error: {:?}", err);
        GovernanceError::InvalidAccountData
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
        GovernanceError::InvalidAccountData
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
        GovernanceError::ClientError
    }
}

impl From<redis::RedisError> for GovernanceError {
    fn from(err: redis::RedisError) -> Self {
        msg!("Redis error: {:?}", err);
        GovernanceError::ClientError
    }
} 