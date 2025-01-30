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
    #[msg("Account not initialized")]
    UninitializedAccount,
    
    #[msg("Arithmetic error occurred")]
    ArithmeticError,
    
    #[msg("Arithmetic overflow occurred")]
    ArithmeticOverflow,
    
    #[msg("Arithmetic underflow occurred")]
    ArithmeticUnderflow,
    
    #[msg("Invalid proposal state")]
    InvalidProposalState,
    
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    
    #[msg("Invalid chaos parameters")]
    InvalidChaosParameters,
    
    #[msg("Invalid parameters")]
    InvalidParameters,
    
    #[msg("Invalid quorum settings")]
    InvalidQuorum,
    
    #[msg("Invalid threshold settings")]
    InvalidThreshold,
    
    #[msg("Invalid rate limit settings")]
    InvalidRateLimit,
    
    #[msg("Invalid minimum stake amount")]
    InvalidMinStake,
    
    #[msg("Invalid voting period")]
    InvalidVotingPeriod,
    
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    
    #[msg("Invalid delegation")]
    InvalidDelegation,
    
    #[msg("Proposal not found")]
    ProposalNotFound,
    
    #[msg("Vote not found")]
    VoteNotFound,
    
    #[msg("Already voted on this proposal")]
    AlreadyVoted,
    
    #[msg("Voting period has ended")]
    VotingPeriodEnded,
    
    #[msg("Voting period has not ended")]
    VotingNotEnded,
    
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    
    #[msg("Execution delay not elapsed")]
    ExecutionDelayNotElapsed,
    
    #[msg("Quorum not reached")]
    QuorumNotReached,
    
    #[msg("Approval threshold not met")]
    ApprovalThresholdNotMet,
    
    #[msg("Insufficient stake")]
    InsufficientStake,
    
    #[msg("Insufficient stake for proposal")]
    InsufficientStakeForProposal,
    
    #[msg("Insufficient voting power")]
    InsufficientVotingPower,
    
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    
    #[msg("Too many active proposals")]
    TooManyActiveProposals,
    
    #[msg("Proposal rate limit exceeded")]
    ProposalRateLimitExceeded,
    
    #[msg("Stake is locked")]
    StakeLocked,
    
    #[msg("Stake is still locked")]
    StakeStillLocked,
    
    #[msg("Active votes exist")]
    ActiveVotesExist,
    
    #[msg("Unauthorized action")]
    Unauthorized,
    
    #[msg("Unauthorized developer")]
    UnauthorizedDeveloper,
    
    #[msg("Unauthorized delegation")]
    UnauthorizedDelegation,
    
    #[msg("Unauthorized unstake")]
    UnauthorizedUnstake,
    
    #[msg("Unauthorized proposal cancellation")]
    UnauthorizedProposalCancellation,
    
    #[msg("Delegation chain not allowed")]
    DelegationChainNotAllowed,
    
    #[msg("Program is halted")]
    ProgramHalted,
    
    #[msg("Program is already halted")]
    AlreadyHalted,
    
    #[msg("Program is not halted")]
    NotHalted,
    
    #[msg("Feature not implemented")]
    NotImplemented,

    #[msg("Invalid instruction data")]
    InvalidInstructionData,

    #[msg("Invalid account data")]
    InvalidAccountData,

    #[msg("Client error")]
    ClientError,

    #[msg("Redis operation failed")]
    RedisError,

    #[msg("Database operation failed")]
    DatabaseError,

    #[msg("Network operation failed")]
    NetworkError,

    #[msg("Serialization error")]
    SerializationError,

    #[msg("Rate limit exceeded")]
    RateLimitExceeded,

    #[msg("Invalid signature")]
    InvalidSignature,

    #[msg("Invalid metadata")]
    InvalidMetadata,
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