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
    #[msg("Arithmetic error")]
    ArithmeticError,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    #[msg("Unauthorized developer")]
    UnauthorizedDeveloper,
    #[msg("Invalid quorum")]
    InvalidQuorum,
    #[msg("Invalid threshold")]
    InvalidThreshold,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    #[msg("Program is halted")]
    ProgramHalted,
    #[msg("Invalid parameters")]
    InvalidParameters,
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
    #[msg("Already voted")]
    AlreadyVoted,
    #[msg("Vote not found")]
    VoteNotFound,
    #[msg("Voting period ended")]
    VotingPeriodEnded,
    #[msg("Voting period is still active")]
    VotingPeriodActive,
    #[msg("Proposal not found")]
    ProposalNotFound,
    #[msg("Invalid proposal state")]
    InvalidProposalState,
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    #[msg("Execution delay not elapsed")]
    ExecutionDelayNotElapsed,
    #[msg("Quorum not reached")]
    QuorumNotReached,
    #[msg("Approval threshold not met")]
    ApprovalThresholdNotMet,
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    #[msg("Unauthorized unstake")]
    UnauthorizedUnstake,
    #[msg("Stake still locked")]
    StakeStillLocked,
    #[msg("Active votes exist")]
    ActiveVotesExist,
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Not halted")]
    NotHalted,
    #[msg("Already halted")]
    AlreadyHalted,
    #[msg("Insufficient stake")]
    InsufficientStake,
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    #[msg("Already delegated")]
    AlreadyDelegated,
    #[msg("Not delegated")]
    NotDelegated,
    #[msg("Unauthorized delegation")]
    UnauthorizedDelegation,
    #[msg("Invalid delegation")]
    InvalidDelegation,
    #[msg("Delegation chain not allowed")]
    DelegationChainNotAllowed,
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    #[msg("Invalid chaos parameters")]
    InvalidChaosParameters,
    #[msg("Insufficient stake for proposal")]
    InsufficientStakeForProposal,
    #[msg("Too many active proposals")]
    TooManyActiveProposals,
    #[msg("Invalid governance config")]
    InvalidGovernanceConfig,
    #[msg("Uninitialized account")]
    UninitializedAccount,
    #[msg("Description too long")]
    DescriptionTooLong,
    #[msg("Execution period has ended")]
    ExecutionPeriodEnded,
    #[msg("Account has sell penalty restrictions")]
    SellPenaltyActive,
    #[msg("Insufficient loyalty score for this action")]
    InsufficientLoyalty,
    #[msg("Loyalty snapshot is still pending")]
    SnapshotPending,
    #[msg("Too many sells in grace period")]
    ExcessiveSelling,
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
