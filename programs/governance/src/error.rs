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
    
    #[msg("Arithmetic operation failed")]
    ArithmeticError,
    
    #[msg("Insufficient stake amount")]
    InsufficientStake,
    
    #[msg("Invalid stake duration")]
    InvalidStakeDuration,
    
    #[msg("Stake still locked")]
    StakeLocked,
    
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    
    #[msg("Proposal rate limit exceeded")]
    RateLimitExceeded,
    
    #[msg("Invalid configuration parameters")]
    InvalidConfigParameters,
    
    #[msg("Serialization error")]
    SerializationError,
    
    #[msg("Client error")]
    ClientError,
    
    #[msg("Test execution failed")]
    TestExecutionFailed,
    
    #[msg("Monitoring initialization failed")]
    MonitoringInitializationFailed,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    
    #[msg("Insufficient stake amount for operation")]
    InsufficientStakeAmount,
    
    #[msg("Delegation chain not allowed")]
    DelegationChainNotAllowed,
}

// Enhanced error context trait with additional functionality
pub trait ErrorContext<T> {
    fn with_context(self, msg: &str) -> Result<T>;
}

// Implement for Result<T, GovernanceError>
impl<T> ErrorContext<T> for Result<T, GovernanceError> {
    fn with_context(self, msg: &str) -> Result<T> {
        self.map_err(|e| {
            msg!("{}: {}", msg, e.to_string());
            e
        })
    }
}

// Implement for Option<T>
impl<T> ErrorContext<T> for Option<T> {
    fn with_context<C>(self, context: C) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static
    {
        self.ok_or_else(|| {
            msg!("{}", context);
            GovernanceError::InvalidProgramState
        })
    }

    fn with_error_details<C, F>(self, f: F) -> Result<T>
    where
        F: FnOnce() -> C,
        C: fmt::Display + Send + Sync + 'static
    {
        self.ok_or_else(|| {
            let context = f();
            msg!("{}", context);
            GovernanceError::InvalidProgramState
        })
    }
}

// Enhanced error conversion implementations
impl From<ProgramError> for GovernanceError {
    fn from(err: ProgramError) -> Self {
        match err {
            ProgramError::Custom(code) => {
                if code == GovernanceError::ArithmeticOverflow as u32 {
                    GovernanceError::ArithmeticOverflow
                } else {
                    GovernanceError::InvalidProgramState
                }
            }
            ProgramError::InvalidAccountData => GovernanceError::StateInconsistency,
            ProgramError::InsufficientFunds => GovernanceError::ResourceExhaustion,
            ProgramError::InvalidArgument => GovernanceError::InvalidStakeAmount,
            ProgramError::AccountAlreadyInitialized => GovernanceError::StateInconsistency,
            ProgramError::UninitializedAccount => GovernanceError::InvalidProgramState,
            ProgramError::NotEnoughAccountKeys => GovernanceError::InvalidStakeAmount,
            ProgramError::AccountBorrowFailed => GovernanceError::StateInconsistency,
            _ => GovernanceError::InvalidProgramState,
        }
    }
}

impl From<anchor_lang::error::Error> for GovernanceError {
    fn from(err: anchor_lang::error::Error) -> Self {
        match err {
            anchor_lang::error::Error::AnchorError(ae) => {
                match ae.error_code_number {
                    1 => GovernanceError::InvalidStakeAmount,
                    2 => GovernanceError::StateInconsistency,
                    3 => GovernanceError::UnauthorizedModification,
                    _ => GovernanceError::InvalidProgramState,
                }
            }
            _ => GovernanceError::InvalidProgramState,
        }
    }
}

impl From<solana_client::client_error::ClientError> for GovernanceError {
    fn from(_: solana_client::client_error::ClientError) -> Self {
        GovernanceError::ClientError
    }
}

impl From<std::io::Error> for GovernanceError {
    fn from(_: std::io::Error) -> Self {
        GovernanceError::SerializationError
    }
}

impl From<MonitoringError> for GovernanceError {
    fn from(err: MonitoringError) -> Self {
        match err {
            MonitoringError::ArithmeticOverflow => GovernanceError::ArithmeticOverflow,
            MonitoringError::InvalidStakeAmount => GovernanceError::InsufficientStake,
            MonitoringError::InvalidLockState => GovernanceError::StakeLocked,
            MonitoringError::RateLimitExceeded => GovernanceError::RateLimitExceeded,
            MonitoringError::HighStakeConcentration => GovernanceError::HighStakeConcentration,
            _ => GovernanceError::InvalidProgramState,
        }
    }
} 