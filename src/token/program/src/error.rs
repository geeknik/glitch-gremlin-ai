use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum GlitchError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    
    #[error("Not enough tokens")]
    InsufficientFunds,
    
    #[error("Invalid chaos request")]
    InvalidChaosRequest,

    #[error("Account not initialized")]
    UninitializedAccount,

    #[error("Invalid account owner")]
    InvalidAccountOwner,

    #[error("Invalid finalizer")]
    InvalidFinalizer,

    #[error("Invalid status transition")]
    InvalidStatusTransition,

    #[error("Invalid token account")]
    InvalidTokenAccount,

    #[error("Invalid escrow account")]
    InvalidEscrowAccount,

    #[error("Invalid token program")]
    InvalidTokenProgram,

    #[error("Arithmetic overflow")]
    Overflow,
}

impl From<GlitchError> for ProgramError {
    fn from(e: GlitchError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
