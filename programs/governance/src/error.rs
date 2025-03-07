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
    #[msg("Invalid chaos parameters")]
    InvalidChaosParameters,
    #[msg("Arithmetic error in calculations")]
    ArithmeticError,
    #[msg("Invalid burn percentage")]
    InvalidBurnPercentage,
    #[msg("Invalid pricing factor")]
    InvalidPricingFactor,
    #[msg("Memory corruption detected")]
    MemoryCorruption,
    #[msg("Invalid governance configuration")]
    InvalidGovernanceConfig,
    #[msg("Invalid stake amount")]
    InvalidStakeAmount,
    #[msg("Insufficient stake balance")]
    InsufficientStake,
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    #[msg("Insufficient voting power")]
    InsufficientVotingPower,
    #[msg("Voting period has ended")]
    VotingPeriodEnded,
    #[msg("Quorum not reached")]
    QuorumNotReached,
    #[msg("Approval threshold not met")]
    ApprovalThresholdNotMet,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    #[msg("Unauthorized delegation")]
    UnauthorizedDelegation,
    #[msg("Invalid delegation")]
    InvalidDelegation,
    #[msg("Delegation chain not allowed")]
    DelegationChainNotAllowed,
    #[msg("Too many active proposals")]
    TooManyActiveProposals,
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
    #[msg("Invalid parameters")]
    InvalidParameters,
    #[msg("Vote not found")]
    VoteNotFound,
    #[msg("Proposal not found")]
    ProposalNotFound,
    #[msg("Invalid proposal state")]
    InvalidProposalState,
    #[msg("Already voted")]
    AlreadyVoted,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Stake still locked")]
    StakeLocked,
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    #[msg("Already delegated")]
    AlreadyDelegated,
    #[msg("Not delegated")]
    NotDelegated,
    #[msg("Unauthorized developer")]
    UnauthorizedDeveloper,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    #[msg("Execution delay not elapsed")]
    ExecutionDelayNotElapsed,
    #[msg("Uninitialized account")]
    UninitializedAccount,
    #[msg("Invalid quorum")]
    InvalidQuorum,
    #[msg("Invalid threshold")]
    InvalidThreshold,
    #[msg("Client error")]
    ClientError,
    #[msg("Serialization error")]
    SerializationError,
    #[msg("Invalid account data")]
    InvalidAccountData,
    #[msg("Database error")]
    DatabaseError,
    #[msg("Redis error")]
    RedisError,
    #[msg("Failed to parse Redis INFO response")]
    RedisInfoParseError,
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Invalid Gremlin test configuration")]
    InvalidGremlinConfig,
    #[msg("Gremlin test execution failed")]
    GremlinTestFailed,
    #[msg("Critical finding detected during Gremlin test")]
    CriticalGremlinFinding,
    #[msg("Failed to generate proof for Gremlin finding")]
    GremlinProofGenerationFailed,
    #[msg("Failed to validate Gremlin test parameters")]
    InvalidGremlinParameters,
    #[msg("Gremlin monitoring error")]
    GremlinMonitoringError,
    #[msg("Exceeded maximum critical findings threshold")]
    ExceededCriticalFindingsThreshold,
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
