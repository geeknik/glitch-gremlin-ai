use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    clock::Clock,
    sysvar::Sysvar,
};
use crate::error::GlitchError;
use crate::state::StakeAccount;

pub struct StakeManager;

impl StakeManager {
    pub fn create_stake(
        stake_account: &mut StakeAccount,
        owner: Pubkey,
        amount: u64,
        lockup_period: u64,
        clock: &Clock,
    ) -> ProgramResult {
        // Validate stake amount
        if amount < 1000 {
            return Err(GlitchError::InvalidStakeAmount.into());
        }

        // Validate lockup period (1 day to 1 year)
        if lockup_period < 86400 || lockup_period > 31536000 {
            return Err(GlitchError::InvalidLockupPeriod.into());
        }

        // Initialize stake account
        stake_account.owner = owner;
        stake_account.amount = amount;
        stake_account.start_time = clock.unix_timestamp;
        stake_account.lockup_period = lockup_period;
        stake_account.rewards = 0;

        Ok(())
    }

    pub fn unstake(
        stake_account: &StakeAccount,
        clock: &Clock,
    ) -> ProgramResult {
        if clock.unix_timestamp < stake_account.start_time + stake_account.lockup_period as i64 {
            return Err(GlitchError::StakeLocked.into());
        }

        Ok(())
    }

    pub fn calculate_rewards(
        stake_account: &StakeAccount,
        clock: &Clock,
    ) -> u64 {
        let stake_duration = clock.unix_timestamp - stake_account.start_time;
        let base_rate = 5; // 5% base APY
        let duration_bonus = (stake_duration as f64 / 31536000.0) * 5.0; // Up to 5% bonus
        let reward_rate = (base_rate as f64 + duration_bonus) / 100.0;
        
        ((stake_account.amount as f64 * reward_rate) * 
         (stake_duration as f64 / 31536000.0)) as u64
    }
}
