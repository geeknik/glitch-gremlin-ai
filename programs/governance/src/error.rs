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
        self.map_err(|e| {
            msg!("{}: {}", operation, message);
            e
        })
    }
}

pub fn create_error_context(operation: &str, message: &str) -> (String, String) {
    (operation.to_string(), message.to_string())
}

#[error_code]
pub enum GovernanceError {
    #[msg("Invalid program state")]
    InvalidProgramState,
    
    #[msg("Invalid instruction data")]
    InvalidInstructionData,
    
    #[msg("Invalid account data")]
    InvalidAccountData,
    
    #[msg("Invalid authority")]
    InvalidAuthority,
    
    #[msg("Account not initialized")]
    AccountNotInitialized,
    
    #[msg("Account already initialized")]
    AccountAlreadyInitialized,
    
    #[msg("Invalid account owner")]
    InvalidAccountOwner,
    
    #[msg("Arithmetic operation overflow")]
    ArithmeticOverflow,
    
    #[msg("Arithmetic operation underflow")]
    ArithmeticUnderflow,
    
    #[msg("Insufficient stake amount")]
    InsufficientStakeBalance,
    
    #[msg("Invalid stake amount")]
    InvalidStakeAmount,
    
    #[msg("Stake account is locked")]
    StakeLocked,
    
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    
    #[msg("Account is already delegated")]
    AlreadyDelegated,
    
    #[msg("Account is not delegated")]
    NotDelegated,
    
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    
    #[msg("Proposal rate limit exceeded")]
    ProposalRateLimitExceeded,
    
    #[msg("Invalid voting period")]
    InvalidVotingPeriod,
    
    #[msg("Voting period has ended")]
    VotingPeriodEnded,
    
    #[msg("Voting period has not ended")]
    VotingPeriodNotEnded,
    
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    
    #[msg("Proposal execution failed")]
    ProposalExecutionFailed,
    
    #[msg("Invalid vote")]
    InvalidVote,
    
    #[msg("Already voted")]
    AlreadyVoted,
    
    #[msg("Invalid quorum percentage")]
    InvalidQuorumPercentage,
    
    #[msg("Invalid approval threshold percentage")]
    InvalidApprovalThresholdPercentage,
    
    #[msg("Treasury operation failed")]
    TreasuryOperationFailed,
    
    #[msg("Invalid treasury amount")]
    InvalidTreasuryAmount,
    
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    
    #[msg("Emergency halt active")]
    EmergencyHaltActive,
    
    #[msg("Invalid emergency action")]
    InvalidEmergencyAction,
    
    #[msg("Unauthorized developer")]
    UnauthorizedDeveloper,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    
    #[msg("Invalid token amount")]
    InvalidTokenAmount,
    
    #[msg("Token transfer failed")]
    TokenTransferFailed,
    
    #[msg("Serialization failed")]
    SerializationFailed,
    
    #[msg("Deserialization failed")]
    DeserializationFailed,
    
    #[msg("Invalid chaos test parameters")]
    InvalidChaosTestParameters,
    
    #[msg("Chaos test execution failed")]
    ChaosTestExecutionFailed,
    
    #[msg("Monitoring initialization failed")]
    MonitoringInitializationFailed,
    
    #[msg("Invalid monitoring parameters")]
    InvalidMonitoringParameters,
    
    #[msg("Monitoring operation failed")]
    MonitoringOperationFailed,
}

impl From<ProgramError> for GovernanceError {
    fn from(err: ProgramError) -> Self {
        match err {
            ProgramError::InvalidArgument => GovernanceError::InvalidInstructionData,
            ProgramError::InvalidAccountData => GovernanceError::InvalidAccountData,
            ProgramError::AccountAlreadyInitialized => GovernanceError::AccountAlreadyInitialized,
            ProgramError::UninitializedAccount => GovernanceError::AccountNotInitialized,
            ProgramError::InsufficientFunds => GovernanceError::InsufficientStakeBalance,
            ProgramError::InvalidProgramId => GovernanceError::InvalidProgramState,
            ProgramError::MissingRequiredSignature => GovernanceError::InvalidAuthority,
            _ => GovernanceError::InvalidProgramState,
        }
    }
}

impl From<anchor_lang::error::Error> for GovernanceError {
    fn from(err: anchor_lang::error::Error) -> Self {
        match err {
            anchor_lang::error::Error::AnchorError(e) => {
                match e.error_code_number {
                    // Map specific Anchor error codes to our error types
                    0 => GovernanceError::InvalidInstructionData,
                    1 => GovernanceError::InvalidProgramState,
                    2 => GovernanceError::AccountNotInitialized,
                    _ => GovernanceError::InvalidProgramState,
                }
            }
            _ => GovernanceError::InvalidProgramState,
        }
    }
}

impl From<std::io::Error> for GovernanceError {
    fn from(_: std::io::Error) -> Self {
        GovernanceError::SerializationFailed
    }
} 