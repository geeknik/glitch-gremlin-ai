use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use core::str::FromStr;

pub mod error;
pub mod state;
mod hash;
pub use hash::{gremlin_hash, GremlinMap};

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

declare_id!("CGdnYbXRM3trAKUeSiPT4it9obeo1iTx3BJhgfriADSL");

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

// Update token constants to match live deployment
pub const GREMLINAI_TOKEN_MINT: &str = "Bx6XZrN7pjbDA5wkiKagbbyHSr1jai45m8peSSmJpump";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const GOVERNANCE_SEED: &[u8] = b"governance";

// Add token validation constants
pub const MIN_STAKE_AMOUNT: u64 = 1_000_000; // 1M tokens
pub const MIN_PROPOSAL_STAKE: u64 = 5_000_000; // 5M tokens
pub const BASE_CHAOS_FEE: u64 = 100_000; // 0.1M tokens

impl GovernanceConfig {
    pub fn validate(&self) -> Result<()> {
        // Validate configuration against token supply
        require!(
            self.min_stake_amount >= MIN_STAKE_AMOUNT,
            GovernanceError::InvalidConfigValue
        );
        require!(
            self.min_proposal_stake >= MIN_PROPOSAL_STAKE,
            GovernanceError::InvalidConfigValue
        );
        require!(
            self.quorum_percentage >= 1 && self.quorum_percentage <= 100,
            GovernanceError::InvalidConfigValue
        );
        require!(
            self.approval_threshold >= 51 && self.approval_threshold <= 100,
            GovernanceError::InvalidConfigValue
        );
        require!(
            self.voting_period >= 24 * 60 * 60, // Minimum 1 day
            GovernanceError::InvalidConfigValue
        );
        require!(
            self.execution_delay >= 12 * 60 * 60, // Minimum 12 hours
            GovernanceError::InvalidConfigValue
        );
        Ok(())
    }
}

// Add token validation function
pub fn validate_token_account(
    token_account: &Account<TokenAccount>,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
) -> Result<()> {
    require!(
        token_account.mint == *expected_mint,
        GovernanceError::InvalidTokenMint
    );
    require!(
        token_account.owner == *expected_owner,
        GovernanceError::InvalidTokenOwner
    );
    Ok(())
}

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

    pub fn initialize_token(ctx: Context<InitializeToken>) -> Result<()> {
        msg!("Initializing GREMLINAI token");
        
        // Create mint account
        let mint_rent = ctx.accounts.rent.minimum_balance(Mint::LEN);
        
        // Transfer rent-exempt SOL to mint account
        system_program::create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.mint.to_account_info(),
                },
            ),
            mint_rent,
            Mint::LEN as u64,
            &ctx.accounts.token_program.key(),
        )?;
        
        // Initialize mint with 6 decimals
        token::initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::InitializeMint {
                    mint: ctx.accounts.mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            6, // Decimals as per DESIGN.md
            &ctx.accounts.mint_authority.key(),
            Some(&ctx.accounts.mint_authority.key()),
        )?;
        
        // Set up Metaplex metadata (will be done in a separate instruction)
        
        msg!("GREMLINAI token initialized successfully");
        Ok(())
    }

    pub fn initialize_token_metadata(ctx: Context<InitializeTokenMetadata>) -> Result<()> {
        msg!("Initializing GREMLINAI token metadata");
        
        // Create metadata account
        let token_metadata_program_id = ctx.accounts.token_metadata_program.key();
        
        let metadata_seeds = &[
            b"metadata",
            token_metadata_program_id.as_ref(),
            ctx.accounts.mint.key().as_ref(),
        ];
        
        let (metadata_pda, _bump) = Pubkey::find_program_address(
            metadata_seeds,
            &token_metadata_program_id,
        );
        
        require!(
            metadata_pda == ctx.accounts.metadata.key(),
            GovernanceError::InvalidMetadataAccount
        );
        
        // Create metadata instruction
        let create_metadata_ix = mpl_token_metadata::instruction::create_metadata_accounts_v3(
            token_metadata_program_id,
            ctx.accounts.metadata.key(),
            ctx.accounts.mint.key(),
            ctx.accounts.mint_authority.key(),
            ctx.accounts.payer.key(),
            ctx.accounts.mint_authority.key(),
            "Glitch Gremlin AI".to_string(),
            "GREMLINAI".to_string(),
            "https://arweave.net/[PLACEHOLDER_HASH]".to_string(),
            Some(vec![
                mpl_token_metadata::state::Creator {
                    address: ctx.accounts.mint_authority.key(),
                    verified: true,
                    share: 100,
                }
            ]),
            500, // 5% royalty
            true,
            true,
            None,
            None,
            None,
        );
        
        // Execute create metadata instruction
        solana_program::program::invoke_signed(
            &create_metadata_ix,
            &[
                ctx.accounts.metadata.clone(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.token_metadata_program.clone(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            &[],
        )?;
        
        msg!("GREMLINAI token metadata initialized successfully");
        Ok(())
    }

    pub fn distribute_tokens(
        ctx: Context<DistributeTokens>,
        amount: u64,
        vesting_schedule: Option<VestingSchedule>,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.verify_not_halted()?;

        // Verify token mint
        GovernanceState::verify_gremlinai_token(&ctx.accounts.token_mint.key())?;

        // Check distribution limits
        require!(
            amount <= governance.config.max_distribution_amount,
            GovernanceError::ExceedsDistributionLimit
        );

        // If vesting schedule provided, create vesting account
        if let Some(schedule) = vesting_schedule {
            // Create vesting account
            let vesting = &mut ctx.accounts.vesting_account;
            vesting.beneficiary = ctx.accounts.recipient.key();
            vesting.total_amount = amount;
            vesting.released_amount = 0;
            vesting.start_time = Clock::get()?.unix_timestamp;
            vesting.end_time = vesting.start_time + schedule.duration;
            vesting.cliff_time = vesting.start_time + schedule.cliff_duration;
            vesting.period = schedule.period;
            
            // Transfer tokens to vesting account
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.distribution_authority.to_account_info(),
                        to: ctx.accounts.vesting_token_account.to_account_info(),
                        authority: ctx.accounts.distribution_authority.to_account_info(),
                    },
                ),
                amount,
            )?;
        } else {
            // Direct transfer if no vesting
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.distribution_authority.to_account_info(),
                        to: ctx.accounts.recipient_token_account.to_account_info(),
                        authority: ctx.accounts.distribution_authority.to_account_info(),
                    },
                ),
                amount,
            )?;
        }

        // Update distribution metrics
        governance.total_distributed = governance.total_distributed
            .checked_add(amount)
            .ok_or(GovernanceError::ArithmeticError)?;

        Ok(())
    }

    pub fn release_vested_tokens(ctx: Context<ReleaseVestedTokens>) -> Result<()> {
        let vesting = &mut ctx.accounts.vesting_account;
        let current_time = Clock::get()?.unix_timestamp;

        // Check if vesting has started
        require!(
            current_time >= vesting.start_time,
            GovernanceError::VestingNotStarted
        );

        // Check if cliff has passed
        require!(
            current_time >= vesting.cliff_time,
            GovernanceError::CliffNotReached
        );

        // Calculate vested amount
        let vested_amount = if current_time >= vesting.end_time {
            vesting.total_amount
        } else {
            let time_from_start = current_time - vesting.start_time;
            let total_vesting_time = vesting.end_time - vesting.start_time;
            (vesting.total_amount as u128)
                .checked_mul(time_from_start as u128)
                .and_then(|product| product.checked_div(total_vesting_time as u128))
                .and_then(|quotient| quotient.try_into().ok())
                .ok_or(GovernanceError::ArithmeticError)?
        };

        // Calculate releasable amount
        let releasable = vested_amount
            .checked_sub(vesting.released_amount)
            .ok_or(GovernanceError::ArithmeticError)?;

        if releasable > 0 {
            // Transfer vested tokens
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.vesting_token_account.to_account_info(),
                        to: ctx.accounts.beneficiary_token_account.to_account_info(),
                        authority: ctx.accounts.vesting_account.to_account_info(),
                    },
                ),
                releasable,
            )?;

            // Update released amount
            vesting.released_amount = vesting.released_amount
                .checked_add(releasable)
                .ok_or(GovernanceError::ArithmeticError)?;
        }

        Ok(())
    }

    pub fn collect_chaos_fee(
        ctx: Context<CollectChaosFee>,
        test_params: ChaosParams,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.verify_not_halted()?;

        // Calculate fee based on test parameters
        let base_fee = governance.config.base_chaos_fee;
        let complexity_multiplier = match test_params.complexity {
            ChaosComplexity::Low => 1,
            ChaosComplexity::Medium => 2,
            ChaosComplexity::High => 3,
        };
        
        let duration_multiplier = test_params.duration
            .checked_div(60) // Convert to minutes
            .and_then(|d| d.checked_add(1))
            .ok_or(GovernanceError::ArithmeticError)?;

        let total_fee = base_fee
            .checked_mul(complexity_multiplier)
            .and_then(|fee| fee.checked_mul(duration_multiplier as u64))
            .ok_or(GovernanceError::ArithmeticError)?;

        // Apply rate limiting
        let current_time = Clock::get()?.unix_timestamp;
        if current_time - governance.last_fee_collection < governance.config.fee_window {
            governance.fee_count_window = governance.fee_count_window
                .checked_add(1)
                .ok_or(GovernanceError::ArithmeticError)?;
            
            require!(
                governance.fee_count_window <= governance.config.max_fees_per_window,
                GovernanceError::RateLimitExceeded
            );
        } else {
            governance.fee_count_window = 1;
            governance.last_fee_collection = current_time;
        }

        // Transfer fee to treasury
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            total_fee,
        )?;

        // Update treasury metrics
        governance.treasury_balance = governance.treasury_balance
            .checked_add(total_fee)
            .ok_or(GovernanceError::ArithmeticError)?;
        
        governance.total_fees_collected = governance.total_fees_collected
            .checked_add(total_fee)
            .ok_or(GovernanceError::ArithmeticError)?;

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

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This is the mint authority
    #[account(mut)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeTokenMetadata<'info> {
    #[account(mut)]
    pub metadata: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    /// CHECK: This is the mint authority
    pub mint_authority: Signer<'info>,
    pub payer: Signer<'info>,
    pub token_metadata_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct VestingSchedule {
    pub duration: i64,
    pub cliff_duration: i64,
    pub period: i64,
}

#[derive(Accounts)]
pub struct DistributeTokens<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(mut)]
    pub distribution_authority: Signer<'info>,
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = distribution_authority,
        space = 8 + std::mem::size_of::<VestingAccount>()
    )]
    pub vesting_account: Option<Account<'info, VestingAccount>>,
    #[account(mut)]
    pub vesting_token_account: Option<Account<'info, TokenAccount>>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseVestedTokens<'info> {
    #[account(mut)]
    pub vesting_account: Account<'info, VestingAccount>,
    #[account(mut)]
    pub vesting_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub beneficiary_token_account: Account<'info, TokenAccount>,
    pub beneficiary: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct VestingAccount {
    pub beneficiary: Pubkey,
    pub total_amount: u64,
    pub released_amount: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub cliff_time: i64,
    pub period: i64,
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
    pub base_chaos_fee: u64,
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
            base_chaos_fee: 100_000, // Base fee for chaos request calculation
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

#[derive(Accounts)]
pub struct CollectChaosFee<'info> {
    #[account(mut)]
    pub governance: Account<'info, GovernanceState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub payer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ChaosComplexity {
    Low,
    Medium,
    High,
}

impl<'info> CreateProposal<'info> {
    pub fn validate(&self, params: &ChaosParameters) -> Result<()> {
        // Verify proposal creator has sufficient stake
        require!(
            self.proposer_stake.amount >= MIN_PROPOSAL_STAKE,
            GovernanceError::InsufficientStakeForProposal
        );

        // Verify stake is locked
        let clock = Clock::get()?;
        require!(
            self.proposer_stake.locked_until > clock.unix_timestamp,
            GovernanceError::StakeNotLocked
        );

        // Validate chaos parameters
        require!(
            params.duration <= 3600, // Max 1 hour
            GovernanceError::InvalidTestParameters
        );

        // Check for malicious parameters
        if params.target_program == self.governance.key() {
            return Err(GovernanceError::InvalidTargetProgram.into());
        }

        // Verify target program is not in blocklist
        require!(
            !self.governance.is_program_blocked(&params.target_program),
            GovernanceError::ProgramBlocked
        );

        Ok(())
    }
}

impl<'info> ExecuteProposal<'info> {
    pub fn validate(&self) -> Result<()> {
        let clock = Clock::get()?;
        
        // Verify proposal state
        require!(
            self.proposal.state == ProposalState::Succeeded,
            GovernanceError::InvalidProposalState
        );

        // Verify execution delay
        require!(
            clock.unix_timestamp >= self.proposal.execution_time,
            GovernanceError::ExecutionDelayNotElapsed
        );

        // Verify quorum
        let total_votes = self.proposal.yes_votes + self.proposal.no_votes;
        let quorum = (self.governance.config.quorum_percentage as u64 * self.proposal.total_stake_snapshot) / 100;
        require!(
            total_votes >= quorum,
            GovernanceError::QuorumNotReached
        );

        // Verify approval threshold
        let approval_threshold = (self.governance.config.approval_threshold as u64 * total_votes) / 100;
        require!(
            self.proposal.yes_votes >= approval_threshold,
            GovernanceError::ApprovalThresholdNotMet
        );

        // Verify treasury if needed
        if self.proposal.chaos_params.requires_treasury_funding {
            require!(
                self.governance.treasury_balance >= self.proposal.chaos_params.treasury_amount,
                GovernanceError::InsufficientTreasuryBalance
            );

            let (treasury_pda, _) = Pubkey::find_program_address(
                &[TREASURY_SEED],
                ctx.program_id
            );
            require!(
                treasury_pda == self.treasury.key(),
                GovernanceError::InvalidTreasuryAccount
            );
        }

        Ok(())
    }
}

// Add emergency circuit breaker
pub fn emergency_circuit_breaker(ctx: Context<EmergencyAction>) -> Result<()> {
    let governance = &mut ctx.accounts.governance;
    
    // Only multisig authority can trigger circuit breaker
    require!(
        governance.verify_multisig_authority(&ctx.accounts.authority)?,
        GovernanceError::UnauthorizedEmergencyAction
    );

    // Halt all operations
    governance.emergency_halt_active = true;
    governance.last_emergency_action = Clock::get()?.unix_timestamp;

    emit!(EmergencyActionEvent {
        action: EmergencyActionType::HaltProgram,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// Add multisig verification
impl GovernanceState {
    pub fn verify_multisig_authority(&self, signer: &AccountInfo) -> Result<bool> {
        // Verify signer is part of multisig
        let multisig_owners = self.get_multisig_owners()?;
        if !multisig_owners.contains(&signer.key()) {
            return Ok(false);
        }

        // Verify required signatures are present
        let signatures = self.get_action_signatures()?;
        if signatures.len() < self.config.min_signatures as usize {
            return Ok(false);
        }

        Ok(true)
    }
}

pub mod allocator;
pub use allocator::{
    GremlinSecureAllocator,
    config::AllocatorConfig,
    monitor::{AllocatorMonitor, MonitoringStats},
};

use nexus_zkvm::security::SecurityLevel;

#[global_allocator]
static ALLOCATOR: GremlinSecureAllocator = GremlinSecureAllocator::new(SecurityLevel::Maximum);

