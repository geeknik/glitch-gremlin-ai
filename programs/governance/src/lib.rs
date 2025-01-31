use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use std::str::FromStr;

pub mod error;
pub mod state;

// Re-export core types from state module
pub use state::{
    governance::GovernanceParams,
    proposal::{Proposal, ProposalAction},
    vote_record::VoteRecord,
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ProposalState,
    ProposalStatus,
    ChaosParams,
    ChaosMode,
    ChaosCondition,
    DefenseLevel,
    ProposalVotingState,
    ProposalMetadata,
    GovernanceMetrics,
};

pub use error::GovernanceError;

declare_id!("Governance111111111111111111111111111111111");

// Constants for PDA seeds and rate limiting
pub const GOVERNANCE_SEED: &[u8] = b"governance";
pub const STAKE_INFO_SEED: &[u8] = b"stake_info";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const DEFAULT_PROPOSAL_RATE_LIMIT: u64 = 5;
pub const DEFAULT_PROPOSAL_RATE_WINDOW: i64 = 24 * 60 * 60; // 24 hours
pub const GREMLINAI_TOKEN_MINT: &str = "Bx6XZrN7pjbDA5wkiKagbbyHSr1jai45m8peSSmJpump";
pub const DEV_WALLET: &str = "12ZA59vt9MW9XNfpDNThamLmPsPFQ2MEgkngk1F7HGkn";
pub const TREASURY_AUTH_SEED: &[u8] = b"treasury_auth";
pub const EMERGENCY_HALT_SEED: &[u8] = b"emergency_halt";

// Re-export types from state module
pub use state::{
    governance::{GovernanceParams, ProposalVotingState, ProposalMetadata},
    governance_state::GovernanceMetrics,
    proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ChaosParams, ChaosMode, ChaosCondition, DefenseLevel,
};

// Re-export types from state module
pub use state::{
    governance::{GovernanceParams, ProposalVotingState, ProposalMetadata},
    governance_state::GovernanceMetrics,
    proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ChaosParams, ChaosMode, ChaosCondition, DefenseLevel,
};

// Re-export types from state module
pub use state::{
    governance::{GovernanceParams, ProposalVotingState, ProposalMetadata},
    governance_state::GovernanceMetrics,
    proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ChaosParams, ChaosMode, ChaosCondition, DefenseLevel,
};

// Re-export types from state module
pub use state::{
    governance::{GovernanceParams, ProposalVotingState, ProposalMetadata},
    governance_state::GovernanceMetrics,
    proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ChaosParams, ChaosMode, ChaosCondition, DefenseLevel,
};

>>>>>>> 3107af2 (fix: Remove duplicate GovernanceState and clean up imports)
=======
// Re-export types from state module
pub use state::{
    governance::{GovernanceParams, ProposalVotingState, ProposalMetadata},
    governance_state::GovernanceMetrics,
    proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    stake_account::{StakeAccount, StakeOperation, StakeOperationType},
    ChaosParams, ChaosMode, ChaosCondition, DefenseLevel,
};

>>>>>>> 3107af2 (fix: Remove duplicate GovernanceState and clean up imports)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum EmergencyActionType {
    UpdateConfig(Box<GovernanceConfig>),
    UpdateAuthority(Pubkey),
    HaltProgram,
    ResumeProgram,
    BlockAddress(Pubkey),
    EnableDefenseMode(DefenseLevel),
}

#[event]
pub struct EmergencyActionEvent {
    pub action: EmergencyActionType,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[program]
pub mod glitch_gremlin_governance {
    use super::*;
    use crate::state::governance_state::GovernanceState;
    use crate::state::governance::GovernanceParams;
    use crate::error::GovernanceError;
=======
#[program]
pub mod glitch_gremlin_governance {
    use super::*;
    use crate::state::governance_state::GovernanceState;
    use crate::state::governance::GovernanceParams;
    use crate::error::GovernanceError;

    pub fn initialize(
        ctx: Context<Initialize>,
        authority: Pubkey,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.is_initialized = true;
        governance.authority = authority;
        governance.config = GovernanceConfig::default();
        governance.total_proposals = 0;
        governance.total_staked = 0;
        governance.treasury_balance = 0;
        governance.emergency_halt_active = false;
        governance.last_proposal_time = 0;
        governance.proposal_count_window = 0;
        governance.total_treasury_inflow = 0;
        governance.total_treasury_outflow = 0;

        Ok(())
    }

    pub fn stake_tokens(ctx: Context<StakeTokens>, amount: u64) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.verify_not_halted()?;

        // Verify token mint
        GovernanceState::verify_gremlinai_token(&ctx.accounts.stake_mint.key())?;

        require!(
            amount >= governance.config.min_stake_amount,
            GovernanceError::InsufficientStakeAmount
        );

        // Transfer tokens to stake account
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.staker_token_account.to_account_info(),
                    to: ctx.accounts.stake_account.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update stake record
        let stake_info = &mut ctx.accounts.stake_info;
        stake_info.staker = ctx.accounts.staker.key();
        stake_info.amount = amount;
        stake_info.locked_until = Clock::get()?.unix_timestamp + governance.config.stake_lockup_duration;
        stake_info.delegated_to = None;
        stake_info.last_vote_time = 0;
        stake_info.active_votes = 0;

        governance.total_staked = governance.total_staked.checked_add(amount)
            .ok_or(GovernanceError::ArithmeticError)?;

        emit!(StakeEvent {
            staker: stake_info.staker,
            amount,
            locked_until: stake_info.locked_until,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn delegate_stake(ctx: Context<DelegateStake>, delegate: Pubkey) -> Result<()> {
        let stake_info = &mut ctx.accounts.stake_info;
        require!(
            stake_info.staker == ctx.accounts.staker.key(),
            GovernanceError::UnauthorizedDelegation
        );
        
        // Prevent self-delegation
        require!(
            delegate != ctx.accounts.staker.key(),
            GovernanceError::InvalidDelegation
        );

        // Prevent delegation chains (delegate must not already be delegating)
        let delegate_stake = &ctx.accounts.delegate_stake_info;
        require!(
            delegate_stake.delegated_to.is_none(),
            GovernanceError::DelegationChainNotAllowed
        );
        
        stake_info.delegated_to = Some(delegate);
        Ok(())
    }

    pub fn create_chaos_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        chaos_params: ChaosParameters,
        voting_period: i64,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &mut ctx.accounts.governance;
        let clock = Clock::get()?;

        governance.verify_not_halted()?;

        // Check rate limiting
        governance.check_proposal_rate_limit(clock.unix_timestamp)?;

        // Validate proposal parameters
        require!(
            title.len() <= 64 && description.len() <= 256,
            GovernanceError::InvalidProposalParameters
        );

        // Validate chaos parameters
        require!(
            chaos_params.is_valid(),
            GovernanceError::InvalidChaosParameters
        );

        // Check proposer has minimum stake and no active proposals
        let stake_info = &ctx.accounts.proposer_stake;
        require!(
            stake_info.amount >= governance.config.min_proposal_stake,
            GovernanceError::InsufficientStakeForProposal
        );

        // Verify proposer's token mint
        GovernanceState::verify_gremlinai_token(&ctx.accounts.stake_mint.key())?;

        // Check if proposer has other active proposals
        require!(
            stake_info.active_proposals == 0,
            GovernanceError::TooManyActiveProposals
        );

        proposal.proposer = ctx.accounts.proposer.key();
        proposal.title = title;
        proposal.description = description;
        proposal.chaos_params = chaos_params;
        proposal.start_time = clock.unix_timestamp;
        proposal.end_time = clock.unix_timestamp + voting_period;
        proposal.execution_time = proposal.end_time + governance.config.execution_delay;
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.executed = false;
        proposal.state = ProposalState::Active;
        proposal.total_stake_snapshot = governance.total_staked;
        proposal.unique_voters = 0;
        proposal.stake_mint = ctx.accounts.stake_mint.key();

        // Update rate limiting state
        governance.last_proposal_time = clock.unix_timestamp;
        governance.proposal_count_window = governance.proposal_count_window.checked_add(1)
            .ok_or(GovernanceError::ArithmeticError)?;

        governance.total_proposals = governance.total_proposals.checked_add(1)
            .ok_or(GovernanceError::ArithmeticError)?;

        // Update proposer's active proposals count
        let proposer_stake = &mut ctx.accounts.proposer_stake;
        proposer_stake.active_proposals = proposer_stake.active_proposals.checked_add(1)
            .ok_or(GovernanceError::ArithmeticError)?;

        emit!(ProposalCreatedEvent {
            proposal: proposal.key(),
            proposer: proposal.proposer,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, support: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let stake_info = &ctx.accounts.voter_stake;
        let clock = Clock::get()?;

        require!(
            proposal.state == ProposalState::Active,
            GovernanceError::InvalidProposalState
        );
        require!(
            clock.unix_timestamp <= proposal.end_time,
            GovernanceError::VotingPeriodEnded
        );

        // Check if voter has staked or is a delegate
        let voting_power = if stake_info.staker == ctx.accounts.voter.key() {
            stake_info.amount
        } else if stake_info.delegated_to == Some(ctx.accounts.voter.key()) {
            stake_info.amount
        } else {
            return Err(GovernanceError::InsufficientVotingPower.into());
        };

        if support {
            proposal.yes_votes += voting_power;
        } else {
            proposal.no_votes += voting_power;
        }

        Ok(())
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &mut ctx.accounts.governance;
        let clock = Clock::get()?;

        require!(
            !proposal.executed,
            GovernanceError::ProposalAlreadyExecuted
        );
        require!(
            clock.unix_timestamp >= proposal.execution_time,
            GovernanceError::ExecutionDelayNotElapsed
        );

        let total_votes = proposal.yes_votes + proposal.no_votes;
        let quorum = (governance.config.quorum_percentage as u64 * proposal.total_stake_snapshot) / 100;

        require!(
            total_votes >= quorum,
            GovernanceError::QuorumNotReached
        );

        let approval_threshold = (governance.config.approval_threshold_percentage as u64 * total_votes) / 100;
        require!(
            proposal.yes_votes >= approval_threshold,
            GovernanceError::ApprovalThresholdNotMet
        );

        // Verify treasury PDA if funding is required
        if proposal.chaos_params.requires_treasury_funding {
            let required_amount = proposal.chaos_params.treasury_amount;
            require!(
                governance.treasury_balance >= required_amount,
                GovernanceError::InsufficientTreasuryBalance
            );
            
            // Verify treasury authority
            let (treasury_pda, _) = Pubkey::find_program_address(
                &[TREASURY_SEED],
                ctx.program_id
            );
            require!(
                treasury_pda == ctx.accounts.treasury.key(),
                GovernanceError::InvalidTreasuryAccount
            );

            // Transfer funds from treasury
            governance.treasury_balance = governance.treasury_balance.checked_sub(required_amount)
                .ok_or(GovernanceError::ArithmeticError)?;
        }

        proposal.executed = true;
        proposal.state = ProposalState::Executed;
        proposal.execution_time = clock.unix_timestamp;

        emit!(ProposalExecutedEvent {
            proposal: proposal.key(),
            executor: ctx.accounts.executor.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn unstake_tokens(ctx: Context<UnstakeTokens>) -> Result<()> {
        let stake_info = &ctx.accounts.stake_info;
        let clock = Clock::get()?;

        require!(
            stake_info.staker == ctx.accounts.staker.key(),
            GovernanceError::UnauthorizedUnstake
        );

        require!(
            clock.unix_timestamp >= stake_info.locked_until,
            GovernanceError::StakeStillLocked
        );

        // Check for active votes before unstaking
        require!(
            !ctx.accounts.governance.has_active_votes(&stake_info.staker),
            GovernanceError::ActiveVotesExist
        );

        let amount = stake_info.amount;

        // Transfer tokens back to staker
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.stake_account.to_account_info(),
                    to: ctx.accounts.staker_token_account.to_account_info(),
                    authority: ctx.accounts.governance.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.governance.total_staked = ctx.accounts.governance.total_staked.checked_sub(amount)
            .ok_or(GovernanceError::ArithmeticError)?;

        Ok(())
    }

    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        
        require!(
            proposal.proposer == ctx.accounts.proposer.key(),
            GovernanceError::UnauthorizedProposalCancellation
        );

        require!(
            proposal.state == ProposalState::Active,
            GovernanceError::InvalidProposalState
        );

        proposal.state = ProposalState::Cancelled;
        
        // If proposal required treasury funding, no need to update treasury as it wasn't taken yet
        Ok(())
    }

    pub fn emergency_action(
        ctx: Context<EmergencyAction>,
        action: EmergencyActionType,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        match action {
            EmergencyActionType::HaltProgram => {
                require!(!ctx.accounts.governance.emergency_halt_active, GovernanceError::AlreadyHalted);
                ctx.accounts.governance.emergency_halt_active = true;
            }
            EmergencyActionType::ResumeProgram => {
                require!(ctx.accounts.governance.emergency_halt_active, GovernanceError::NotHalted);
                ctx.accounts.governance.emergency_halt_active = false;
            }
            EmergencyActionType::UpdateConfig(new_config) => {
                // Validate new config
                new_config.validate()?;
                ctx.accounts.governance.config = *new_config;
            }
            EmergencyActionType::UpdateAuthority(new_authority) => {
                ctx.accounts.governance.authority = new_authority;
            }
            EmergencyActionType::BlockAddress(address) => {
                // Implementation for blocking an address
                // This is a placeholder and should be implemented
                return Err(GovernanceError::NotImplemented.into());
            }
            EmergencyActionType::EnableDefenseMode(level) => {
                // Implementation for enabling a defense mode
                // This is a placeholder and should be implemented
                return Err(GovernanceError::NotImplemented.into());
            }
        }

        emit!(EmergencyActionEvent {
            action,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn manage_treasury(
        ctx: Context<ManageTreasury>,
        action: TreasuryAction,
        amount: u64,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.verify_not_halted()?;
        
        match action {
            TreasuryAction::Deposit => {
                // Transfer tokens to treasury
                anchor_spl::token::transfer(
                    CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        anchor_spl::token::Transfer {
                            from: ctx.accounts.from_token_account.to_account_info(),
                            to: ctx.accounts.treasury_token_account.to_account_info(),
                            authority: ctx.accounts.authority.to_account_info(),
                        },
                    ),
                    amount,
                )?;

                governance.treasury_balance = governance.treasury_balance.checked_add(amount)
                    .ok_or(GovernanceError::ArithmeticError)?;
                governance.total_treasury_inflow = governance.total_treasury_inflow.checked_add(amount)
                    .ok_or(GovernanceError::ArithmeticError)?;
            },
            TreasuryAction::Withdraw => {
                // Only dev wallet can withdraw
                GovernanceState::verify_dev_authority(&ctx.accounts.authority.key())?;
                
                require!(
                    governance.treasury_balance >= amount,
                    GovernanceError::InsufficientTreasuryBalance
                );

                // Transfer tokens from treasury
                let treasury_seeds = &[
                    TREASURY_SEED,
                    &[governance.treasury_bump]
                ];
                let treasury_signer = &[&treasury_seeds[..]];

                anchor_spl::token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        anchor_spl::token::Transfer {
                            from: ctx.accounts.treasury_token_account.to_account_info(),
                            to: ctx.accounts.to_token_account.to_account_info(),
                            authority: ctx.accounts.treasury.to_account_info(),
                        },
                        treasury_signer,
                    ),
                    amount,
                )?;

                governance.treasury_balance = governance.treasury_balance.checked_sub(amount)
                    .ok_or(GovernanceError::ArithmeticError)?;
                governance.total_treasury_outflow = governance.total_treasury_outflow.checked_add(amount)
                    .ok_or(GovernanceError::ArithmeticError)?;
            }
        }

        emit!(TreasuryActionEvent {
            action,
            amount,
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// Event definitions
#[event]
pub struct GovernanceInitializedEvent {
    pub authority: Pubkey,
    pub config: GovernanceConfig,
    pub timestamp: i64,
}

#[event]
pub struct ProposalCreatedEvent {
    pub proposal: Pubkey,
    pub proposer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProposalExecutedEvent {
    pub proposal: Pubkey,
    pub executor: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = GovernanceState::space())]
    pub governance: Account<'info, GovernanceState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(
        init,
        payer = staker,
        space = 8 + std::mem::size_of::<StakeInfo>()
    )]
    pub stake_info: Account<'info, StakeInfo>,
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(mut)]
    pub staker_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub stake_account: Account<'info, TokenAccount>,
    pub stake_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateStake<'info> {
    #[account(mut)]
    pub stake_info: Account<'info, StakeInfo>,
    #[account(mut)]
    pub delegate_stake_info: Account<'info, StakeInfo>,
    pub staker: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(
        init,
        payer = proposer,
        space = 8 + std::mem::size_of::<Proposal>()
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub proposer_stake: Account<'info, StakeInfo>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub voter: Signer<'info>,
    pub voter_stake: Account<'info, StakeInfo>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    /// CHECK: Treasury PDA, verified in instruction
    pub treasury: AccountInfo<'info>,
    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnstakeTokens<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(
        mut,
        has_one = staker,
        close = staker
    )]
    pub stake_info: Account<'info, StakeInfo>,
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(mut)]
    pub staker_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub stake_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub proposer: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyAction<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(
        constraint = authority.key() == governance.authority @ GovernanceError::UnauthorizedDeveloper
    )]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageTreasury<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    /// CHECK: Treasury PDA, verified in instruction
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_token_account: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GovernanceState {
    pub config: GovernanceConfig,
    pub total_proposals: u64,
    pub total_staked: u64,
    pub treasury_balance: u64,
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub treasury_bump: u8,
    pub last_proposal_time: i64,
    pub proposal_count_window: u64,
    pub emergency_halt_active: bool,
    pub last_emergency_action: i64,
    pub total_treasury_inflow: u64,
    pub total_treasury_outflow: u64,
    pub treasury_auth_bump: u8,
    pub emergency_halt_bump: u8,
}

#[account]
pub struct StakeInfo {
    pub staker: Pubkey,
    pub amount: u64,
    pub locked_until: i64,
    pub delegated_to: Option<Pubkey>,
    pub last_vote_time: i64,
    pub active_votes: u64,
    pub active_proposals: u64,
}

#[account]
pub struct Proposal {
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub chaos_params: ChaosParameters,
    pub start_time: i64,
    pub end_time: i64,
    pub execution_time: i64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub executed: bool,
    pub state: ProposalState,
    pub total_stake_snapshot: u64,
    pub unique_voters: u64,
    pub stake_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ProposalState {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
    Cancelled,
    Quarantined, // DESIGN.md 9.1 state
}

#[event]
pub struct SecurityEvent {
    pub action: SecurityAction,
    pub timestamp: i64,
    pub signatures: Vec<[u8;64]>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum SecurityAction {
    ProposalQuarantine { proposal: Pubkey, reason: String },
    ValidatorSlash { validator: Pubkey, amount: u64 },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GovernanceConfig {
    pub min_stake_amount: u64,
    pub min_stake_duration: u64,
    pub min_proposal_stake: u64,
    pub proposal_delay: u64,
    pub voting_period: u64,
    pub quorum_percentage: u8,
    pub approval_threshold: u8,
    pub execution_delay: u64,
    pub grace_period: u64,
    pub treasury_fee_bps: u16,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            min_stake_amount: 1_000_000,
            min_stake_duration: 604_800, // 7 days
            min_proposal_stake: 5_000_000,
            proposal_delay: 86_400, // 1 day
            voting_period: 302_400, // 3.5 days
            quorum_percentage: 10,
            approval_threshold: 60,
            execution_delay: 86_400, // 1 day
            grace_period: 43_200, // 12 hours
            treasury_fee_bps: 100, // 1%
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TreasuryAction {
    Deposit,
    Withdraw,
}

#[event]
pub struct TreasuryActionEvent {
    pub action: TreasuryAction,
    pub amount: u64,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StakeEvent {
    pub staker: Pubkey,
    pub amount: u64,
    pub locked_until: i64,
    pub timestamp: i64,
}

#[program]

