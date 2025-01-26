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

    #[error("Invalid proof")]
    InvalidProof,

    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Insufficient stake amount")]
    InsufficientStake,

    #[error("Quorum not reached")]
    QuorumNotReached,

    #[error("Insufficient geographic diversity")]
    InsufficientDiversity,

    #[error("Invalid region")]
    InvalidRegion,

    // Security-critical errors from DESIGN.md 9.1
    #[error("7/10 multisig verification required")]
    InsufficientMultisigSignatures,

    #[error("Program not initialized")]
    UninitializedProgram,

    #[error("Invalid upgrade authority")]
    InvalidUpgradeAuthority,

    #[error("Upgrade delay not met")]
    UpgradeDelayNotMet,

    #[error("72-hour execution delay not met")]
    ExecutionDelayNotMet,

    #[error("Invalid security level (must be 1-4)")]
    InvalidSecurityLevel,

    #[error("Missing required proof of human")]
    HumanVerificationRequired,

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
    ArithmeticOverflow,

    #[error("Invalid burn percentage")]
    InvalidBurnPercentage,

    #[error("Invalid dynamic pricing factor")]
    InvalidPricingFactor,

    // Rate limiting errors
    #[error("Rate limit exceeded")]
    RateLimitExceeded,
    
    #[error("Invalid target program")]
    InvalidTargetProgram,

    #[error("Rate limit exceeded - tokens burned")]
    RateLimitExceededWithBurn,

    #[error("Invalid completion proof")]
    InvalidCompletionProof,

    #[error("Invalid result reference")]
    InvalidResultReference,
    
    #[error("Invalid rate limit parameters")]
    InvalidRateLimit,

    // Staking errors
    #[error("Invalid stake amount")]
    InvalidStakeAmount,
    
    #[error("Stake still locked")]
    StakeLocked,
    
    #[error("Invalid lockup period")]
    InvalidLockupPeriod,
    
    #[error("Stake not found")]
    StakeNotFound,

    // Advanced governance errors
    #[error("Invalid proposal parameters")]
    InvalidProposal,
    
    #[error("Insufficient voting power")]
    InsufficientVotingPower,
    
    #[error("Proposal already executed")]
    ProposalAlreadyExecuted,
    
    #[error("Invalid vote weight")]
    InvalidVoteWeight,
    
    #[error("Voting period not started")]
    VotingNotStarted,
    
    #[error("Voting period ended")]
    VotingEnded,
    
    #[error("Proposal not approved")]
    ProposalNotApproved,
    
}

impl From<GlitchError> for ProgramError {
    fn from(e: GlitchError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
