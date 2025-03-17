use anchor_lang::prelude::*;

pub const MIN_STAKE_DURATION: i64 = 7 * 24 * 60 * 60; // 7 days
pub const MAX_STAKE_DURATION: i64 = 365 * 24 * 60 * 60; // 1 year
pub const MIN_STAKE_AMOUNT: u64 = 1_000_000; // 1 GREMLINAI (6 decimals)
pub const MAX_STAKE_AMOUNT: u64 = 1_000_000_000_000; // 1,000,000 GREMLINAI
pub const MAX_HISTORY_LENGTH: usize = 20;

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount: u64,
    pub locked_until: i64,
    pub voting_power: u64,
    pub delegated_to: Option<Pubkey>,
    pub operations: Vec<StakeOperation>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StakeOperation {
    pub operation_type: StakeOperationType,
    pub amount: u64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum StakeOperationType {
    Stake,
    Unstake,
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
        // Validate amount
        if amount < MIN_STAKE_AMOUNT || amount > MAX_STAKE_AMOUNT {
            return Err(GovernanceError::InvalidStakeAmount.into());
        }

        // Check for overflow
        self.amount = self.amount.checked_add(amount)
            .ok_or(GovernanceError::ArithmeticOverflow)?;

        let clock = Clock::get()?;
        let operation = StakeOperation {
            operation_type: StakeOperationType::Deposit,
            amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        };

        self.record_operation(operation);
        self.update_voting_power()?;

        Ok(())
    }

    pub fn withdraw(&mut self, amount: u64) -> Result<()> {
        // Check if account is locked
        if self.is_locked {
            let clock = Clock::get()?;
            if clock.unix_timestamp < self.locked_until {
                return Err(GovernanceError::StakeLocked.into());
            }
        }

        // Validate withdrawal amount
        if amount > self.amount {
            return Err(GovernanceError::InsufficientStakeBalance.into());
        }

        // Check for underflow
        self.amount = self.amount.checked_sub(amount)
            .ok_or(GovernanceError::ArithmeticUnderflow)?;

        let clock = Clock::get()?;
        let operation = StakeOperation {
            operation_type: StakeOperationType::Withdraw,
            amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        };

        self.record_operation(operation);
        self.update_voting_power()?;

        Ok(())
    }

    pub fn lock(&mut self, duration: i64) -> Result<()> {
        // Validate lock duration
        if duration < MIN_STAKE_DURATION || duration > MAX_STAKE_DURATION {
            return Err(GovernanceError::InvalidLockDuration.into());
        }

        // Ensure account has stake
        if self.amount == 0 {
            return Err(GovernanceError::InsufficientStakeBalance.into());
        }

        let clock = Clock::get()?;
        
        // Calculate lock end time with overflow check
        self.locked_until = clock.unix_timestamp.checked_add(duration)
            .ok_or(GovernanceError::ArithmeticOverflow)?;
        
        self.is_locked = true;

        let operation = StakeOperation {
            operation_type: StakeOperationType::Lock,
            amount: self.amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        };

        self.record_operation(operation);
        self.update_voting_power()?;

        Ok(())
    }

    pub fn unlock(&mut self) -> Result<()> {
        let clock = Clock::get()?;
        
        // Check if unlock is allowed
        if self.is_locked && clock.unix_timestamp < self.locked_until {
            return Err(GovernanceError::StakeLocked.into());
        }

        self.is_locked = false;
        self.locked_until = 0;

        let operation = StakeOperation {
            operation_type: StakeOperationType::Unlock,
            amount: self.amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        };

        self.record_operation(operation);
        self.update_voting_power()?;

        Ok(())
    }

    pub fn delegate(&mut self, delegate: Pubkey) -> Result<()> {
        // Ensure account has stake
        if self.amount == 0 {
            return Err(GovernanceError::InsufficientStakeBalance.into());
        }

        // Prevent delegation if already delegated
        if self.delegation.is_some() {
            return Err(GovernanceError::AlreadyDelegated.into());
        }

        self.delegation = Some(delegate);

        let clock = Clock::get()?;
        let operation = StakeOperation {
            operation_type: StakeOperationType::Delegate,
            amount: self.amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        };

        self.record_operation(operation);
        self.update_voting_power()?;

        Ok(())
    }

    pub fn undelegate(&mut self) -> Result<()> {
        // Check if delegation exists
        if self.delegation.is_none() {
            return Err(GovernanceError::NotDelegated.into());
        }

        self.delegation = None;

        let clock = Clock::get()?;
        let operation = StakeOperation {
            operation_type: StakeOperationType::Undelegate,
            amount: self.amount,
            timestamp: clock.unix_timestamp,
            slot: clock.slot,
        };

        self.record_operation(operation);
        self.update_voting_power()?;

        Ok(())
    }

    pub fn update_voting_power(&mut self) -> Result<()> {
        let mut base_power = self.amount;

        // Apply lock bonus (if any)
        if self.is_locked {
            let clock = Clock::get()?;
            let remaining_lock_time = self.locked_until.saturating_sub(clock.unix_timestamp);
            if remaining_lock_time > 0 {
                // Calculate lock bonus: 1% per month of lock, up to 12%
                let months = (remaining_lock_time / (30 * 24 * 60 * 60)).min(12);
                let bonus = base_power.saturating_mul(months as u64) / 100;
                base_power = base_power.saturating_add(bonus);
            }
        }

        // Apply delegation bonus (if any)
        if self.delegation.is_some() {
            // 5% bonus for delegation
            let delegation_bonus = base_power.saturating_mul(5) / 100;
            base_power = base_power.saturating_add(delegation_bonus);
        }

        self.voting_power = base_power;
        Ok(())
    }

    fn record_operation(&mut self, operation: StakeOperation) {
        self.stake_history.push(operation);
        
        // Maintain history size limit
        if self.stake_history.len() > MAX_HISTORY_LENGTH {
            self.stake_history.remove(0);
        }
    }

    pub fn get_effective_stake(&self) -> u64 {
        if self.is_locked {
            let clock = Clock::get().unwrap_or_default();
            if clock.unix_timestamp < self.locked_until {
                return self.amount;
            }
        }
        self.amount
    }

    pub fn can_withdraw(&self, amount: u64) -> Result<bool> {
        if amount > self.amount {
            return Ok(false);
        }

        if self.is_locked {
            let clock = Clock::get()?;
            if clock.unix_timestamp < self.locked_until {
                return Ok(false);
            }
        }

        Ok(true)
    }

    pub fn is_delegated(&self) -> bool {
        self.delegation.is_some()
    }

    pub fn get_lock_duration(&self) -> Option<i64> {
        if !self.is_locked {
            return None;
        }

        let clock = Clock::get().ok()?;
        let remaining = self.locked_until.saturating_sub(clock.unix_timestamp);
        if remaining <= 0 {
            return None;
        }

        Some(remaining)
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
    #[msg("Account is already delegated")]
    AlreadyDelegated,
    #[msg("Account is not delegated")]
    NotDelegated,
} 
