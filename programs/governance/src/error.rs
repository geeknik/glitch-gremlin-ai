use anchor_lang::prelude::*;

#[error_code]
pub enum GovernanceError {
    #[msg("Invalid governance configuration")]
    InvalidConfig,
    #[msg("Invalid proposal")]
    InvalidProposal,
    #[msg("Invalid vote")]
    InvalidVote,
    #[msg("Invalid treasury operation")]
    InvalidTreasuryOp,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Emergency halt active")]
    EmergencyHaltActive,
    #[msg("Invalid config parameters")]
    InvalidConfigParameters,
    #[msg("Insufficient stake amount")]
    InsufficientStakeAmount,
    #[msg("Insufficient stake for creating proposal")]
    InsufficientStakeForProposal,
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    #[msg("Execution delay not elapsed")]
    ExecutionDelayNotElapsed,
    #[msg("Quorum not reached")]
    QuorumNotReached,
    #[msg("Approval threshold not met")]
    ApprovalThresholdNotMet,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    #[msg("Unauthorized delegation")]
    UnauthorizedDelegation,
    #[msg("Cannot unstake while votes are active")]
    ActiveVotesExist,
    #[msg("Stake is still in locked period")]
    StakeStillLocked,
    #[msg("Unauthorized unstake attempt")]
    UnauthorizedUnstake,
    #[msg("Unauthorized proposal cancellation")]
    UnauthorizedProposalCancellation,
    #[msg("Arithmetic error")]
    ArithmeticError,
    #[msg("Invalid proposal parameters")]
    InvalidProposalParameters,
    #[msg("Invalid chaos parameters")]
    InvalidChaosParameters,
    #[msg("Proposal is not in valid state")]
    InvalidProposalState,
    #[msg("Voting period has ended")]
    VotingPeriodEnded,
    #[msg("Insufficient voting power")]
    InsufficientVotingPower,
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Proposal rate limit exceeded")]
    ProposalRateLimitExceeded,
    #[msg("Invalid delegation - cannot delegate to self")]
    InvalidDelegation,
    #[msg("Delegation chain not allowed")]
    DelegationChainNotAllowed,
    #[msg("Invalid token mint - must be GREMLINAI token")]
    InvalidTokenMint,
    #[msg("Unauthorized developer action")]
    UnauthorizedDeveloper,
    #[msg("Program is currently halted")]
    ProgramHalted,
    #[msg("Program is already halted")]
    AlreadyHalted,
    #[msg("Program is not halted")]
    NotHalted,
    #[msg("Too many active proposals")]
    TooManyActiveProposals,
    #[msg("Invalid quorum percentage")]
    InvalidQuorum,
    #[msg("Invalid approval threshold percentage")]
    InvalidThreshold,
    #[msg("Invalid voting period")]
    InvalidVotingPeriod,
    #[msg("Invalid proposal rate limit")]
    InvalidProposalRateLimit,
    #[msg("Invalid proposal rate window")]
    InvalidProposalRateWindow,
    #[msg("Invalid execution delay")]
    InvalidExecutionDelay,
    #[msg("Invalid stake lockup duration")]
    InvalidStakeLockupDuration,
    #[msg("Insufficient stake")]
    InsufficientStake,
    #[msg("Feature not implemented")]
    NotImplemented,
    #[msg("Invalid rate limit")]
    InvalidRateLimit,
    #[msg("Invalid minimum stake")]
    InvalidMinStake,
} 