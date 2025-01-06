#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Clock;

    #[test]
    fn test_create_stake() {
        let mut stake_account = StakeAccount {
            owner: Pubkey::new_unique(),
            amount: 0,
            start_time: 0,
            lockup_period: 0,
            rewards: 0,
        };

        let owner = Pubkey::new_unique();
        let clock = Clock {
            slot: 0,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: 100,
        };

        // Test valid stake creation
        assert!(StakeManager::create_stake(
            &mut stake_account,
            owner,
            1000,
            86400,
            &clock
        ).is_ok());

        // Test invalid amount
        assert!(StakeManager::create_stake(
            &mut stake_account,
            owner,
            500, // Below minimum
            86400,
            &clock
        ).is_err());

        // Test invalid lockup period
        assert!(StakeManager::create_stake(
            &mut stake_account,
            owner,
            1000,
            86399, // Below minimum
            &clock
        ).is_err());
    }

    #[test]
    fn test_unstake() {
        let stake_account = StakeAccount {
            owner: Pubkey::new_unique(),
            amount: 1000,
            start_time: 100,
            lockup_period: 86400,
            rewards: 0,
        };

        let early_clock = Clock {
            unix_timestamp: 100 + 86399, // Just before lockup ends
            ..Clock::default()
        };

        let late_clock = Clock {
            unix_timestamp: 100 + 86401, // Just after lockup ends
            ..Clock::default()
        };

        // Test unstake before lockup ends
        assert!(StakeManager::unstake(&stake_account, &early_clock).is_err());

        // Test unstake after lockup ends
        assert!(StakeManager::unstake(&stake_account, &late_clock).is_ok());
    }

    #[test]
    fn test_calculate_rewards() {
        let stake_account = StakeAccount {
            owner: Pubkey::new_unique(),
            amount: 1000,
            start_time: 100,
            lockup_period: 31536000, // 1 year
            rewards: 0,
        };

        let clock = Clock {
            unix_timestamp: 100 + 31536000, // After 1 year
            ..Clock::default()
        };

        let rewards = StakeManager::calculate_rewards(&stake_account, &clock);
        assert!(rewards > 0);
        assert!(rewards <= (stake_account.amount as f64 * 0.10) as u64); // Max 10% APY
    }
}
