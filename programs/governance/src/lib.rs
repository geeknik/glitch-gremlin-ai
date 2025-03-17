use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use std::str::FromStr;
use std::convert::TryInto;

pub mod error;
pub mod state;
pub mod git_utils;

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

// Account structures for the governance program
#[account]
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
    pub proposal_counter: u64,
}

#[account]
pub struct GovernanceStake {
    pub owner: Pubkey,
    pub amount: u64,
    pub lock_until: i64,
    pub voting_power: u64,
}

#[account]
pub struct GovernanceProposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub description: String,
    pub created_at: i64,
    pub voting_deadline: i64,
    pub votes_for: u64,
    pub votes_against: u64,
    pub executed: bool,
    pub execution_deadline: i64,
    pub chaos_parameters: Option<ChaosParams>,
}

#[account]
pub struct GovernanceVote {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub amount: u64,
    pub is_yes: bool,
    pub timestamp: i64,
}

pub use error::GovernanceError;

declare_id!("GGremN5xG5gx3VQ8CqpVX1EdfxQt5u4ij1fF8GGR8zf");

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

#[event]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub description: String,
    pub voting_deadline: i64,
    pub timestamp: i64,
}

#[event]
pub struct VoteEvent {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub amount: u64,
    pub is_yes: bool,
    pub timestamp: i64,
}

#[event]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub executor: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ChaosExecutionEvent {
    pub proposal_id: u64,
    pub target_program: Pubkey,
    pub chaos_type: String,
    pub intensity: u8,
    pub executor: Pubkey,
    pub timestamp: i64,
}

#[program]
pub mod glitch_gremlin_governance {
    use super::*;

    pub fn initialize_governance(ctx: Context<InitializeGovernance>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        *config = GovernanceConfig::default();
        config.proposal_counter = 0;
        
        // Log initialization
        msg!("Governance initialized with config: {:?}", config);
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64, lock_duration: i64) -> Result<()> {
        let clock = Clock::get()?;
        let stake_account = &mut ctx.accounts.stake_account;
        let config = &ctx.accounts.config;
        
        // Security: Validate lock duration and amount
        require!(
            lock_duration >= config.min_stake_duration.try_into().unwrap(),
            GovernanceError::InvalidLockDuration
        );
        require!(
            amount >= config.min_stake_amount,
            GovernanceError::InsufficientStake
        );
        
        // Transfer tokens using CPI
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.staking_vault.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        // Update stake account with overflow protection
        if stake_account.owner == Pubkey::default() {
            stake_account.owner = ctx.accounts.user_authority.key();
        }
        
        stake_account.amount = stake_account.amount
            .checked_add(amount)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        stake_account.lock_until = clock.unix_timestamp
            .checked_add(lock_duration)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        // Calculate voting power with time bonus (longer lock = more power)
        let duration_bonus = lock_duration
            .checked_div(86400) // Convert to days
            .unwrap_or(0)
            .checked_mul(5) // 5% bonus per day
            .unwrap_or(0);
            
        let bonus_multiplier = 100
            .checked_add(duration_bonus.try_into().unwrap())
            .unwrap_or(100);
            
        stake_account.voting_power = amount
            .checked_mul(bonus_multiplier.into())
            .unwrap_or(amount)
            .checked_div(100)
            .unwrap_or(amount);

        // Emit stake event
        emit!(StakeEvent {
            staker: ctx.accounts.user_authority.key(),
            amount,
            locked_until: stake_account.lock_until,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
    
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let stake_account = &mut ctx.accounts.stake_account;
        
        // Check if lock period has expired
        require!(
            clock.unix_timestamp >= stake_account.lock_until,
            GovernanceError::StakeStillLocked
        );
        
        // Check if user has enough staked
        require!(
            stake_account.amount >= amount,
            GovernanceError::InsufficientStake
        );
        
        // Transfer tokens back to user
        let seeds = &[
            b"gov_vault".as_ref(),
            &[ctx.bumps.staking_vault]
        ];
        let signer = &[&seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.staking_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.staking_vault.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;
        
        // Update stake account
        stake_account.amount = stake_account.amount
            .checked_sub(amount)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        // Recalculate voting power
        let duration_remaining = stake_account.lock_until
            .checked_sub(clock.unix_timestamp)
            .unwrap_or(0);
            
        let duration_bonus = duration_remaining
            .checked_div(86400) // Convert to days
            .unwrap_or(0)
            .checked_mul(5) // 5% bonus per day
            .unwrap_or(0);
            
        let bonus_multiplier = 100
            .checked_add(duration_bonus.try_into().unwrap())
            .unwrap_or(100);
            
        stake_account.voting_power = stake_account.amount
            .checked_mul(bonus_multiplier.into())
            .unwrap_or(stake_account.amount)
            .checked_div(100)
            .unwrap_or(stake_account.amount);
            
        Ok(())
    }
    
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        description: String,
        chaos_parameters: Option<ChaosParams>
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;
        let proposal = &mut ctx.accounts.proposal;
        let stake_account = &ctx.accounts.stake_account;
        
        // Check if user has enough stake to create proposal
        require!(
            stake_account.voting_power >= config.min_proposal_stake,
            GovernanceError::InsufficientStake
        );
        
        // Validate description length
        require!(
            description.len() <= 200,
            GovernanceError::DescriptionTooLong
        );
        
        // Increment proposal counter
        let proposal_id = config.proposal_counter;
        config.proposal_counter = config.proposal_counter
            .checked_add(1)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        // Set proposal fields
        proposal.id = proposal_id;
        proposal.proposer = ctx.accounts.user_authority.key();
        proposal.description = description;
        proposal.created_at = clock.unix_timestamp;
        proposal.voting_deadline = clock.unix_timestamp
            .checked_add(config.voting_period.try_into().unwrap())
            .ok_or(GovernanceError::ArithmeticOverflow)?;
        proposal.votes_for = 0;
        proposal.votes_against = 0;
        proposal.executed = false;
        proposal.execution_deadline = proposal.voting_deadline
            .checked_add(config.execution_delay.try_into().unwrap())
            .ok_or(GovernanceError::ArithmeticOverflow)?;
        proposal.chaos_parameters = chaos_parameters;
        
        // Emit proposal created event
        emit!(ProposalCreatedEvent {
            proposal_id,
            proposer: proposal.proposer,
            description: proposal.description.clone(),
            voting_deadline: proposal.voting_deadline,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn vote(ctx: Context<Vote>, is_yes: bool) -> Result<()> {
        let clock = Clock::get()?;
        let proposal = &mut ctx.accounts.proposal;
        let vote_record = &mut ctx.accounts.vote_record;
        let stake_account = &ctx.accounts.stake_account;
        
        // Check if voting period is still active
        require!(
            clock.unix_timestamp < proposal.voting_deadline,
            GovernanceError::VotingPeriodEnded
        );
        
        // Check if user has voting power
        require!(
            stake_account.voting_power > 0,
            GovernanceError::InsufficientStake
        );
        
        // Record the vote
        vote_record.proposal_id = proposal.id;
        vote_record.voter = ctx.accounts.user_authority.key();
        vote_record.amount = stake_account.voting_power;
        vote_record.is_yes = is_yes;
        vote_record.timestamp = clock.unix_timestamp;
        
        // Update proposal vote counts
        if is_yes {
            proposal.votes_for = proposal.votes_for
                .checked_add(stake_account.voting_power)
                .ok_or(GovernanceError::ArithmeticOverflow)?;
        } else {
            proposal.votes_against = proposal.votes_against
                .checked_add(stake_account.voting_power)
                .ok_or(GovernanceError::ArithmeticOverflow)?;
        }
        
        // Emit vote event
        emit!(VoteEvent {
            proposal_id: proposal.id,
            voter: vote_record.voter,
            amount: vote_record.amount,
            is_yes,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let clock = Clock::get()?;
        let proposal = &mut ctx.accounts.proposal;
        let config = &ctx.accounts.config;
        
        // Check if proposal can be executed
        require!(
            !proposal.executed,
            GovernanceError::AlreadyExecuted
        );
        
        require!(
            clock.unix_timestamp > proposal.voting_deadline,
            GovernanceError::VotingPeriodActive
        );
        
        require!(
            clock.unix_timestamp < proposal.execution_deadline,
            GovernanceError::ExecutionPeriodEnded
        );
        
        // Calculate total votes
        let total_votes = proposal.votes_for
            .checked_add(proposal.votes_against)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        // Check quorum
        let min_votes_required = config.min_proposal_stake
            .checked_mul(config.quorum_percentage.into())
            .ok_or(GovernanceError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        require!(
            total_votes >= min_votes_required,
            GovernanceError::QuorumNotReached
        );
        
        // Check approval threshold
        let approval_percentage = proposal.votes_for
            .checked_mul(100)
            .ok_or(GovernanceError::ArithmeticOverflow)?
            .checked_div(total_votes)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
            
        require!(
            approval_percentage >= config.approval_threshold.into(),
            GovernanceError::ApprovalThresholdNotMet
        );
        
        // Mark as executed
        proposal.executed = true;
        
        // If this is a chaos proposal, trigger the chaos execution
        if let Some(chaos_params) = &proposal.chaos_parameters {
            // Here we would trigger the chaos execution
            // This would typically involve a CPI to the chaos program
            // or setting up a PDA that the off-chain system can monitor
            
            emit!(ChaosExecutionEvent {
                proposal_id: proposal.id,
                target_program: chaos_params.target_program,
                chaos_type: chaos_params.chaos_type.clone(),
                intensity: chaos_params.intensity,
                executor: ctx.accounts.executor.key(),
                timestamp: clock.unix_timestamp,
            });
        }
        
        // Emit execution event
        emit!(ProposalExecutedEvent {
            proposal_id: proposal.id,
            executor: ctx.accounts.executor.key(),
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGovernance<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 8 + 2 + 8,
        seeds = [GOVERNANCE_SEED],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        init_if_needed,
        payer = user_authority,
        space = 8 + 32 + 8 + 8 + 8,
        seeds = [STAKE_INFO_SEED, user_authority.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, GovernanceStake>,
    
    #[account(
        seeds = [GOVERNANCE_SEED],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    
    #[account(mut)]
    pub user_authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_token_account.owner == user_authority.key(),
        constraint = user_token_account.mint == Pubkey::from_str(GREMLINAI_TOKEN_MINT).unwrap()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"gov_vault"],
        bump,
        constraint = staking_vault.mint == Pubkey::from_str(GREMLINAI_TOKEN_MINT).unwrap()
    )]
    pub staking_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, user_authority.key().as_ref()],
        bump,
        constraint = stake_account.owner == user_authority.key()
    )]
    pub stake_account: Account<'info, GovernanceStake>,
    
    #[account(mut)]
    pub user_authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_token_account.owner == user_authority.key(),
        constraint = user_token_account.mint == Pubkey::from_str(GREMLINAI_TOKEN_MINT).unwrap()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"gov_vault"],
        bump,
        constraint = staking_vault.mint == Pubkey::from_str(GREMLINAI_TOKEN_MINT).unwrap()
    )]
    pub staking_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(description: String, chaos_parameters: Option<ChaosParams>)]
pub struct CreateProposal<'info> {
    #[account(
        mut,
        seeds = [GOVERNANCE_SEED],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    
    #[account(
        init,
        payer = user_authority,
        space = 8 + 8 + 32 + 4 + description.len() + 8 + 8 + 8 + 8 + 1 + 8 + 
                if let Some(params) = &chaos_parameters { 
                    32 + 4 + params.chaos_type.len() + 1 
                } else { 
                    1 
                },
        seeds = [PROPOSAL_SEED, &config.proposal_counter.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, GovernanceProposal>,
    
    #[account(
        seeds = [STAKE_INFO_SEED, user_authority.key().as_ref()],
        bump,
        constraint = stake_account.owner == user_authority.key()
    )]
    pub stake_account: Account<'info, GovernanceStake>,
    
    #[account(mut)]
    pub user_authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, &proposal.id.to_le_bytes()],
        bump,
        constraint = !proposal.executed,
        constraint = Clock::get()?.unix_timestamp < proposal.voting_deadline
    )]
    pub proposal: Account<'info, GovernanceProposal>,
    
    #[account(
        init,
        payer = user_authority,
        space = 8 + 8 + 32 + 8 + 1 + 8,
        seeds = [
            b"vote",
            proposal.id.to_le_bytes().as_ref(),
            user_authority.key().as_ref()
        ],
        bump
    )]
    pub vote_record: Account<'info, GovernanceVote>,
    
    #[account(
        seeds = [STAKE_INFO_SEED, user_authority.key().as_ref()],
        bump,
        constraint = stake_account.owner == user_authority.key()
    )]
    pub stake_account: Account<'info, GovernanceStake>,
    
    #[account(mut)]
    pub user_authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, &proposal.id.to_le_bytes()],
        bump,
        constraint = !proposal.executed,
        constraint = Clock::get()?.unix_timestamp > proposal.voting_deadline,
        constraint = Clock::get()?.unix_timestamp < proposal.execution_deadline
    )]
    pub proposal: Account<'info, GovernanceProposal>,
    
    #[account(
        seeds = [GOVERNANCE_SEED],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    
    #[account(mut)]
    pub executor: Signer<'info>,
    
    pub clock: Sysvar<'info, Clock>,
}
