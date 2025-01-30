#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Clock;
    use solana_program_test::*;
    use solana_sdk::{signature::Keypair, signer::Signer};

    #[tokio::test]
    async fn test_proposal_state_consistency() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        // Create test accounts
        let proposal_keypair = Keypair::new();
        let voter_keypair = Keypair::new();
        
        // Initialize test context
        let mut context = program_test.start_with_context().await;
        
        // Create a test proposal
        let proposal = Proposal {
            proposal_id: proposal_keypair.pubkey(),
            proposer: voter_keypair.pubkey(),
            title: "Test Proposal".to_string(),
            description: "Test Description".to_string(),
            voting_starts_at: 100,
            voting_ends_at: 200,
            execution_delay: 50,
            yes_votes: 1000,
            no_votes: 500,
            state: ProposalState::Active,
            executed: false,
            quorum_percentage: 10,
            approval_threshold_percentage: 60,
        };

        // Store proposal in program state
        let proposal_account = AccountInfo::new(
            &proposal_keypair.pubkey(),
            false,
            true,
            &mut 0,
            &mut proposal.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        // Test active proposal past voting period
        context.set_clock(Clock {
            unix_timestamp: 250, // Past voting period
            ..Clock::default()
        });

        let result = check_proposal_state_consistency(&program_id).unwrap();
        assert!(result.is_some());
        assert!(result.unwrap().contains("voting period has ended"));

        // Test succeeded proposal in execution window
        let mut proposal = proposal.clone();
        proposal.state = ProposalState::Succeeded;
        proposal.voting_ends_at = 200;
        *proposal_account.data.borrow_mut() = proposal.try_to_vec().unwrap();

        context.set_clock(Clock {
            unix_timestamp: 260, // In execution window
            ..Clock::default()
        });

        let result = check_proposal_state_consistency(&program_id).unwrap();
        assert!(result.is_some());
        assert!(result.unwrap().contains("execution window but not executed"));

        // Test vote tally consistency
        let vote = Vote {
            proposal_id: proposal.proposal_id,
            voter: voter_keypair.pubkey(),
            voting_power: 2000,
            approve: true,
        };

        let vote_account = AccountInfo::new(
            &Pubkey::find_program_address(
                &[b"vote", proposal.proposal_id.as_ref()],
                &program_id,
            ).0,
            false,
            true,
            &mut 0,
            &mut vote.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        let result = check_proposal_state_consistency(&program_id).unwrap();
        assert!(result.is_some());
        assert!(result.unwrap().contains("Vote tally mismatch"));
    }

    #[tokio::test]
    async fn test_concurrency_detection() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        let mut context = program_test.start_with_context().await;
        
        // Simulate concurrent transactions
        let mut recent_txs = vec![];
        let base_timestamp = 1000;
        
        // Add transactions in same time window
        for i in 0..6 {
            recent_txs.push((
                base_timestamp + (i as i64),
                Signature::new_unique(),
            ));
        }

        let result = check_transaction_clustering(&recent_txs).unwrap();
        assert!(result.is_some());
        let finding = result.unwrap();
        assert_eq!(finding.severity, FindingSeverity::High);
        assert_eq!(finding.category, FindingCategory::ConcurrencyIssue);
    }

    #[tokio::test]
    async fn test_resource_usage_monitoring() {
        let program_id = Pubkey::new_unique();
        
        // Test critical resource usage
        let result = analyze_resource_usage(
            &program_id,
            1_000_000_000, // 1 SOL
            5, // transactions
        ).unwrap();
        
        assert!(result.is_some());
        let finding = result.unwrap();
        assert_eq!(finding.severity, FindingSeverity::Critical);
        assert_eq!(finding.category, FindingCategory::PerformanceIssue);

        // Test normal resource usage
        let result = analyze_resource_usage(
            &program_id,
            100_000, // 0.0001 SOL
            5, // transactions
        ).unwrap();
        
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_vote_tally_consistency() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        // Create test accounts
        let proposal_keypair = Keypair::new();
        let voter1_keypair = Keypair::new();
        let voter2_keypair = Keypair::new();
        
        // Initialize test context
        let mut context = program_test.start_with_context().await;
        
        // Create a test proposal
        let proposal = Proposal {
            proposal_id: proposal_keypair.pubkey(),
            proposer: voter1_keypair.pubkey(),
            title: "Test Proposal".to_string(),
            description: "Test Description".to_string(),
            voting_starts_at: 100,
            voting_ends_at: 200,
            execution_delay: 50,
            yes_votes: 1500, // Intentionally incorrect
            no_votes: 500,
            state: ProposalState::Active,
            executed: false,
            quorum_percentage: 10,
            approval_threshold_percentage: 60,
        };

        // Create test votes
        let vote1 = Vote {
            proposal_id: proposal.proposal_id,
            voter: voter1_keypair.pubkey(),
            voting_power: 1000,
            approve: true,
        };

        let vote2 = Vote {
            proposal_id: proposal.proposal_id,
            voter: voter2_keypair.pubkey(),
            voting_power: 500,
            approve: false,
        };

        // Store accounts
        let proposal_account = AccountInfo::new(
            &proposal_keypair.pubkey(),
            false,
            true,
            &mut 0,
            &mut proposal.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        let vote1_pda = Pubkey::find_program_address(
            &[b"vote", proposal.proposal_id.as_ref(), voter1_keypair.pubkey().as_ref()],
            &program_id,
        ).0;

        let vote1_account = AccountInfo::new(
            &vote1_pda,
            false,
            true,
            &mut 0,
            &mut vote1.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        let vote2_pda = Pubkey::find_program_address(
            &[b"vote", proposal.proposal_id.as_ref(), voter2_keypair.pubkey().as_ref()],
            &program_id,
        ).0;

        let vote2_account = AccountInfo::new(
            &vote2_pda,
            false,
            true,
            &mut 0,
            &mut vote2.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        // Test vote tally consistency
        let result = check_vote_tally_consistency(&program_id).unwrap();
        assert!(result.is_some());
        let findings = result.unwrap();
        assert!(findings.contains("Yes vote tally mismatch"));
        assert!(findings.contains("stored=1500, calculated=1000"));
    }

    #[tokio::test]
    async fn test_stake_consistency() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        // Create test accounts
        let staker1_keypair = Keypair::new();
        let staker2_keypair = Keypair::new();
        
        // Initialize test context
        let mut context = program_test.start_with_context().await;
        
        // Create stake accounts
        let stake1 = StakeAccount {
            staker: staker1_keypair.pubkey(),
            amount: 1000,
            locked_until: Clock::get().unwrap().unix_timestamp + 1000,
            is_locked: true,
        };

        let stake2 = StakeAccount {
            staker: staker2_keypair.pubkey(),
            amount: 500,
            locked_until: Clock::get().unwrap().unix_timestamp - 1000, // Past lockup
            is_locked: true, // Incorrectly still locked
        };

        // Create stake pool with incorrect total
        let stake_pool = StakePool {
            total_staked: 2000, // Incorrect total (should be 1500)
        };

        // Store accounts
        let stake1_pda = Pubkey::find_program_address(
            &[b"stake", staker1_keypair.pubkey().as_ref()],
            &program_id,
        ).0;

        let stake1_account = AccountInfo::new(
            &stake1_pda,
            false,
            true,
            &mut 0,
            &mut stake1.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        let stake2_pda = Pubkey::find_program_address(
            &[b"stake", staker2_keypair.pubkey().as_ref()],
            &program_id,
        ).0;

        let stake2_account = AccountInfo::new(
            &stake2_pda,
            false,
            true,
            &mut 0,
            &mut stake2.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        let stake_pool_pda = Pubkey::find_program_address(
            &[b"stake_pool"],
            &program_id,
        ).0;

        let stake_pool_account = AccountInfo::new(
            &stake_pool_pda,
            false,
            true,
            &mut 0,
            &mut stake_pool.try_to_vec().unwrap(),
            &program_id,
            false,
            Epoch::default(),
        );

        // Test stake consistency
        let result = check_stake_consistency(&program_id).unwrap();
        assert!(result.is_some());
        let findings = result.unwrap();
        assert!(findings.contains("Total stake mismatch"));
        assert!(findings.contains("pool total=2000, calculated total=1500"));
        assert!(findings.contains("marked as locked but lockup period has expired"));
    }
} 