use anchor_lang::prelude::*;
use std::collections::HashMap;
use crate::error::{GovernanceError, Result};

pub const MIN_STAKE_DURATION: i64 = 7 * 24 * 60 * 60; // 7 days
pub const MAX_STAKE_DURATION: i64 = 365 * 24 * 60 * 60; // 1 year
pub const MIN_STAKE_AMOUNT: u64 = 1_000_000; // 0.001 SOL
pub const MAX_STAKE_AMOUNT: u64 = 1_000_000_000_000; // 1000 SOL

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
    pub fn new(owner: Pubkey) -> Self {
        Self {
            owner,
            amount: 0,
            last_update: Clock::get().unwrap_or_default().unix_timestamp,
            is_locked: false,
            locked_until: 0,
            delegation: None,
            voting_power: 0,
            rewards_earned: 0,
            stake_history: Vec::new(),
        }
    }

    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        require!(amount >= MIN_STAKE_AMOUNT, GovernanceError::InvalidStakeAmount);
        require!(amount <= MAX_STAKE_AMOUNT, GovernanceError::InvalidStakeAmount);

        self.amount = self.amount
            .checked_add(amount)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Failed to add stake amount")?;

        self.record_operation(StakeOperation {
            operation_type: StakeOperationType::Deposit,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            slot: Clock::get()?.slot,
        });

        self.update_voting_power()?;
        Ok(())
    }

    pub fn withdraw(&mut self, amount: u64) -> Result<()> {
        require!(!self.is_locked, GovernanceError::StakeLocked);
        require!(self.can_withdraw(amount)?, GovernanceError::InsufficientStake);

        self.amount = self.amount
            .checked_sub(amount)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Failed to subtract stake amount")?;

        self.record_operation(StakeOperation {
            operation_type: StakeOperationType::Withdraw,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            slot: Clock::get()?.slot,
        });

        self.update_voting_power()?;
        Ok(())
    }

    pub fn lock(&mut self, duration: i64) -> Result<()> {
        require!(!self.is_locked, GovernanceError::InvalidLockState);
        require!(duration >= MIN_STAKE_DURATION, GovernanceError::InvalidLockDuration);
        require!(duration <= MAX_STAKE_DURATION, GovernanceError::InvalidLockDuration);

        let current_time = Clock::get()?.unix_timestamp;
        self.locked_until = current_time
            .checked_add(duration)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Failed to calculate lock end time")?;

        self.is_locked = true;

        self.record_operation(StakeOperation {
            operation_type: StakeOperationType::Lock,
            amount: self.amount,
            timestamp: current_time,
            slot: Clock::get()?.slot,
        });

        self.update_voting_power()?;
        Ok(())
    }

    pub fn unlock(&mut self) -> Result<()> {
        require!(self.is_locked, GovernanceError::InvalidLockState);
        let current_time = Clock::get()?.unix_timestamp;
        require!(current_time >= self.locked_until, GovernanceError::StakeLocked);

        self.is_locked = false;
        self.locked_until = 0;

        self.record_operation(StakeOperation {
            operation_type: StakeOperationType::Unlock,
            amount: self.amount,
            timestamp: current_time,
            slot: Clock::get()?.slot,
        });

        self.update_voting_power()?;
        Ok(())
    }

    pub fn delegate(&mut self, delegate: Pubkey) -> Result<()> {
        require!(self.delegation.is_none(), GovernanceError::InvalidDelegation);
        self.delegation = Some(delegate);

        self.record_operation(StakeOperation {
            operation_type: StakeOperationType::Delegate,
            amount: self.amount,
            timestamp: Clock::get()?.unix_timestamp,
            slot: Clock::get()?.slot,
        });

        Ok(())
    }

    pub fn undelegate(&mut self) -> Result<()> {
        require!(self.delegation.is_some(), GovernanceError::InvalidDelegation);
        self.delegation = None;

        self.record_operation(StakeOperation {
            operation_type: StakeOperationType::Undelegate,
            amount: self.amount,
            timestamp: Clock::get()?.unix_timestamp,
            slot: Clock::get()?.slot,
        });

        Ok(())
    }

    pub fn update_voting_power(&mut self) -> Result<()> {
        let base_power = self.amount;
        
        // Apply lock bonus (up to 50% bonus for max lock duration)
        let lock_bonus = if self.is_locked {
            let current_time = Clock::get()?.unix_timestamp;
            let remaining_lock_time = self.locked_until.saturating_sub(current_time);
            let lock_multiplier = (remaining_lock_time as f64 / MAX_STAKE_DURATION as f64)
                .min(0.5); // Cap at 50% bonus
            (base_power as f64 * lock_multiplier) as u64
        } else {
            0
        };

        self.voting_power = base_power
            .checked_add(lock_bonus)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Failed to calculate voting power")?;

        Ok(())
    }

    fn record_operation(&mut self, operation: StakeOperation) {
        self.stake_history.push(operation);
        self.last_update = Clock::get().unwrap_or_default().unix_timestamp;
    }

    pub fn get_effective_stake(&self) -> u64 {
        if self.delegation.is_some() {
            self.amount
        } else {
            self.amount.saturating_sub(self.amount / 2) // 50% penalty for non-delegated stake
        }
    }

    pub fn can_withdraw(&self, amount: u64) -> Result<bool> {
        if self.is_locked {
            return Ok(false);
        }

        Ok(self.amount >= amount)
    }

    pub fn is_delegated(&self) -> bool {
        self.delegation.is_some()
    }

    pub fn get_lock_duration(&self) -> Option<i64> {
        if self.is_locked {
            let current_time = Clock::get().ok()?.unix_timestamp;
            Some(self.locked_until.saturating_sub(current_time))
        } else {
            None
        }
    }

    pub fn get_stake_history_by_type(&self, operation_type: StakeOperationType) -> Vec<&StakeOperation> {
        self.stake_history
            .iter()
            .filter(|op| op.operation_type == operation_type)
            .collect()
    }

    pub fn get_total_rewards(&self) -> u64 {
        self.rewards_earned
    }
}

#[error_code]
pub enum StakeError {
    #[msg("Invalid stake amount")]
    InvalidAmount,
    #[msg("Stake account is locked")]
    Locked,
    #[msg("Insufficient stake balance")]
    InsufficientBalance,
    #[msg("Invalid lock duration")]
    InvalidLockDuration,
    #[msg("Invalid delegation")]
    InvalidDelegation,
} 