use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    program_pack::IsInitialized,
    pubkey::Pubkey,
};
use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct Proposal {
    pub is_initialized: bool,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub created_at: i64,
    pub start_time: i64,
    pub end_time: i64,
    pub execution_time: Option<i64>,
    pub executed_at: Option<i64>,
    pub canceled_at: Option<i64>,
    pub total_votes_count: u32,
    pub approved_votes_count: u32,
    pub rejected_votes_count: u32,
    pub quorum_percentage: u8,
    pub approval_threshold_percentage: u8,
    pub execution_delay: i64,
    pub chaos_params: ChaosParams,
    pub state: ProposalState,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub executed: bool,
    pub total_stake_snapshot: u64,
    pub unique_voters: u32,
    pub stake_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ChaosParams {
    pub requires_funding: bool,
    pub treasury_amount: u64,
    pub target_program: Pubkey,
    pub max_duration: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ProposalState {
    Draft,
    Active,
    Canceled,
    Succeeded,
    Failed,
    Executed,
}

impl IsInitialized for Proposal {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

#[account]
#[derive(Debug)]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub amount: u64,
    pub support: bool,
    pub timestamp: i64,
    pub voting_power: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct GovernanceConfig {
    pub min_proposal_stake: u64,
    pub proposal_rate_limit: u64,
    pub vote_threshold: u64,
    pub min_voting_period: i64,
    pub max_voting_period: i64,
    pub execution_delay: i64,
    pub grace_period: i64,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            min_proposal_stake: 1_000_000_000, // 1 SOL
            proposal_rate_limit: 10,           // 10 proposals per window
            vote_threshold: 500_000_000,       // 0.5 SOL
            min_voting_period: 86400,          // 1 day
            max_voting_period: 604800,         // 1 week
            execution_delay: 43200,            // 12 hours
            grace_period: 86400,               // 1 day
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct GovernanceState {
    pub config: GovernanceConfig,
    pub proposal_count: u64,
    pub total_stake: u64,
    pub authority: Pubkey,
}

impl Default for GovernanceState {
    fn default() -> Self {
        Self {
            config: GovernanceConfig::default(),
            proposal_count: 0,
            total_stake: 0,
            authority: Pubkey::default(),
        }
    }
}

#[account]
#[derive(Debug)]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount: u64,
    pub last_update: i64,
    pub is_locked: bool,
    pub locked_until: i64,
    pub delegation: Option<Pubkey>,
    pub voting_power: u64,
    pub rewards_earned: u64,
    pub stake_history: Vec<StakeOperation>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StakeOperation {
    pub operation_type: StakeOperationType,
    pub amount: u64,
    pub timestamp: i64,
    pub slot: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum StakeOperationType {
    Deposit,
    Withdraw,
    Lock,
    Unlock,
    Delegate,
    Undelegate,
}

impl StakeAccount {
    pub const DISCRIMINATOR: [u8; 8] = [83, 84, 65, 75, 69, 65, 67, 84]; // "STAKEACT"
    pub const MIN_STAKE_DURATION: i64 = 7 * 24 * 60 * 60; // 7 days
    pub const MAX_STAKE_DURATION: i64 = 365 * 24 * 60 * 60; // 1 year
    pub const MIN_STAKE_AMOUNT: u64 = 1_000_000; // 1 SOL in lamports
    pub const MAX_STAKE_AMOUNT: u64 = 1_000_000_000_000; // 1M SOL in lamports

    pub fn new(owner: Pubkey) -> Self {
        Self {
            owner,
            amount: 0,
            last_update: Clock::get().unwrap().unix_timestamp,
            is_locked: false,
            locked_until: 0,
            delegation: None,
            voting_power: 0,
            rewards_earned: 0,
            stake_history: Vec::new(),
        }
    }

    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        require!(
            amount > 0 && amount <= Self::MAX_STAKE_AMOUNT,
            ErrorCode::InvalidStakeAmount
        );

        self.amount = self.amount
            .checked_add(amount)
            .ok_or(ErrorCode::NumericalOverflow)?;

        self.update_voting_power()?;
        self.record_operation(StakeOperationType::Deposit, amount)?;
        
        Ok(())
    }

    pub fn withdraw(&mut self, amount: u64) -> Result<()> {
        require!(!self.is_locked, ErrorCode::StakeLocked);
        require!(
            amount > 0 && amount <= self.amount,
            ErrorCode::InvalidWithdrawAmount
        );

        self.amount = self.amount
            .checked_sub(amount)
            .ok_or(ErrorCode::NumericalOverflow)?;

        self.update_voting_power()?;
        self.record_operation(StakeOperationType::Withdraw, amount)?;
        
        Ok(())
    }

    pub fn lock(&mut self, duration: i64) -> Result<()> {
        require!(!self.is_locked, ErrorCode::StakeAlreadyLocked);
        require!(
            duration >= Self::MIN_STAKE_DURATION && duration <= Self::MAX_STAKE_DURATION,
            ErrorCode::InvalidLockDuration
        );

        let current_time = Clock::get()?.unix_timestamp;
        self.is_locked = true;
        self.locked_until = current_time
            .checked_add(duration)
            .ok_or(ErrorCode::NumericalOverflow)?;

        // Increase voting power for locked stakes
        self.update_voting_power()?;
        self.record_operation(StakeOperationType::Lock, 0)?;
        
        Ok(())
    }

    pub fn unlock(&mut self) -> Result<()> {
        require!(self.is_locked, ErrorCode::StakeNotLocked);
        require!(
            Clock::get()?.unix_timestamp >= self.locked_until,
            ErrorCode::StakeLockNotExpired
        );

        self.is_locked = false;
        self.locked_until = 0;
        self.update_voting_power()?;
        self.record_operation(StakeOperationType::Unlock, 0)?;
        
        Ok(())
    }

    pub fn delegate(&mut self, delegate: Pubkey) -> Result<()> {
        require!(self.delegation.is_none(), ErrorCode::AlreadyDelegated);
        require!(delegate != self.owner, ErrorCode::CannotDelegateToSelf);

        self.delegation = Some(delegate);
        self.record_operation(StakeOperationType::Delegate, 0)?;
        
        Ok(())
    }

    pub fn undelegate(&mut self) -> Result<()> {
        require!(self.delegation.is_some(), ErrorCode::NotDelegated);

        self.delegation = None;
        self.record_operation(StakeOperationType::Undelegate, 0)?;
        
        Ok(())
    }

    fn update_voting_power(&mut self) -> Result<()> {
        // Base voting power is the stake amount
        let mut power = self.amount;

        // Bonus for locked stakes (up to 50% bonus)
        if self.is_locked {
            let lock_duration = self.locked_until
                .checked_sub(Clock::get()?.unix_timestamp)
                .unwrap_or(0);
            
            let bonus_multiplier = std::cmp::min(
                lock_duration * 100 / Self::MAX_STAKE_DURATION,
                50
            ) as u64;
            
            power = power
                .checked_add(power * bonus_multiplier / 100)
                .ok_or(ErrorCode::NumericalOverflow)?;
        }

        self.voting_power = power;
        Ok(())
    }

    fn record_operation(&mut self, op_type: StakeOperationType, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        self.stake_history.push(StakeOperation {
            operation_type: op_type,
            amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        });

        self.last_update = clock.unix_timestamp;
        Ok(())
    }

    pub fn get_effective_stake(&self) -> u64 {
        if self.delegation.is_some() {
            self.voting_power
        } else {
            self.amount
        }
    }

    pub fn can_withdraw(&self, amount: u64) -> bool {
        !self.is_locked && amount <= self.amount
    }

    pub fn is_delegated(&self) -> bool {
        self.delegation.is_some()
    }

    pub fn get_lock_duration(&self) -> i64 {
        if self.is_locked {
            self.locked_until.saturating_sub(Clock::get().unwrap().unix_timestamp)
        } else {
            0
        }
    }
} 