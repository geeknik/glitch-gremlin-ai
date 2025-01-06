#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Clock;

    #[test]
    fn test_create_proposal() {
        let mut proposal = GovernanceProposal {
            id: 0,
            proposer: Pubkey::new_unique(),
            title: String::new(),
            description: String::new(),
            start_time: 0,
            end_time: 0,
            execution_delay: 0,
            yes_votes: 0,
            no_votes: 0,
            quorum: 0,
            executed: false,
            vote_weights: Vec::new(),
        };

        let proposer = Pubkey::new_unique();
        let clock = Clock {
            unix_timestamp: 100,
            ..Clock::default()
        };

        // Test valid proposal creation
        assert!(GovernanceManager::create_proposal(
            &mut proposal,
            proposer,
            "Test Title".to_string(),
            "Test Description".to_string(),
            &clock
        ).is_ok());

        // Test invalid empty title
        assert!(GovernanceManager::create_proposal(
            &mut proposal,
            proposer,
            "".to_string(),
            "Test Description".to_string(),
            &clock
        ).is_err());
    }

    #[test]
    fn test_cast_vote() {
        let mut proposal = GovernanceProposal {
            id: 1,
            proposer: Pubkey::new_unique(),
            title: "Test".to_string(),
            description: "Test".to_string(),
            start_time: 100,
            end_time: 100 + 259200, // 3 days
            execution_delay: 86400,
            yes_votes: 0,
            no_votes: 0,
            quorum: 1000,
            executed: false,
            vote_weights: Vec::new(),
        };

        let voter = Pubkey::new_unique();
        let weight = 100;

        // Test voting during valid period
        let valid_clock = Clock {
            unix_timestamp: 100 + 86400, // 1 day after start
            ..Clock::default()
        };
        assert!(GovernanceManager::cast_vote(
            &mut proposal,
            voter,
            weight,
            true,
            &valid_clock
        ).is_ok());

        // Test voting before start
        let early_clock = Clock {
            unix_timestamp: 99,
            ..Clock::default()
        };
        assert!(GovernanceManager::cast_vote(
            &mut proposal,
            voter,
            weight,
            true,
            &early_clock
        ).is_err());

        // Test voting after end
        let late_clock = Clock {
            unix_timestamp: 100 + 259201,
            ..Clock::default()
        };
        assert!(GovernanceManager::cast_vote(
            &mut proposal,
            voter,
            weight,
            true,
            &late_clock
        ).is_err());
    }

    #[test]
    fn test_execute_proposal() {
        let mut proposal = GovernanceProposal {
            id: 1,
            proposer: Pubkey::new_unique(),
            title: "Test".to_string(),
            description: "Test".to_string(),
            start_time: 100,
            end_time: 100 + 259200,
            execution_delay: 86400,
            yes_votes: 1500,
            no_votes: 500,
            quorum: 1000,
            executed: false,
            vote_weights: Vec::new(),
        };

        // Test execution before delay period
        let early_clock = Clock {
            unix_timestamp: 100 + 259200, // Right when voting ends
            ..Clock::default()
        };
        assert!(GovernanceManager::execute_proposal(&mut proposal, &early_clock).is_err());

        // Test execution after delay period
        let valid_clock = Clock {
            unix_timestamp: 100 + 259200 + 86401, // After execution delay
            ..Clock::default()
        };
        assert!(GovernanceManager::execute_proposal(&mut proposal, &valid_clock).is_ok());
        assert!(proposal.executed);

        // Test double execution
        assert!(GovernanceManager::execute_proposal(&mut proposal, &valid_clock).is_err());
    }
}
