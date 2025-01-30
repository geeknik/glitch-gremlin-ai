use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer};
use std::str::FromStr;

mod test_utils {
    use super::*;

    pub async fn setup_test_context() -> (ProgramTestContext, Keypair, Pubkey) {
        let program_id = Pubkey::from_str("GremlinGov11111111111111111111111111111111111").unwrap();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(governance::entry),
        );

        let mut ctx = program_test.start_with_context().await;
        let authority = Keypair::new();
        
        // Airdrop to authority
        ctx.banks_client
            .process_transaction(&[solana_sdk::system_instruction::transfer(
                &ctx.payer.pubkey(),
                &authority.pubkey(),
                1_000_000_000,
            )])
            .await
            .unwrap();

        (ctx, authority, program_id)
    }

    pub fn create_test_config() -> governance::GovernanceConfig {
        governance::GovernanceConfig {
            min_stake_amount: 1_000_000,
            min_proposal_stake: 5_000_000,
            voting_period: 7 * 24 * 60 * 60,
            quorum_percentage: 10,
            approval_threshold_percentage: 60,
            execution_delay: 24 * 60 * 60,
            stake_lockup_duration: 30 * 24 * 60 * 60,
        }
    }
}

#[tokio::test]
async fn test_governance_initialization() {
    let (mut ctx, authority, program_id) = test_utils::setup_test_context().await;
    
    // Test valid initialization
    {
        let config = test_utils::create_test_config();
        let tx = governance::instruction::initialize(
            ctx.payer.pubkey(),
            authority.pubkey(),
            program_id,
            config.clone(),
        );

        ctx.banks_client
            .process_transaction(&[tx])
            .await
            .expect("Failed to initialize governance");

        // Verify initialization
        let governance_pda = Pubkey::find_program_address(
            &[governance::GOVERNANCE_SEED],
            &program_id,
        ).0;
        
        let governance_account = ctx.banks_client
            .get_account(governance_pda)
            .await
            .expect("Failed to fetch governance account")
            .expect("Governance account not found");

        assert!(governance_account.data.len() > 0);
    }

    // Test invalid initialization parameters
    {
        let mut invalid_config = test_utils::create_test_config();
        invalid_config.quorum_percentage = 101;
        
        let tx = governance::instruction::initialize(
            ctx.payer.pubkey(),
            authority.pubkey(),
            program_id,
            invalid_config,
        );

        let err = ctx.banks_client
            .process_transaction(&[tx])
            .await
            .expect_err("Should fail with invalid config");

        assert_eq!(
            err.unwrap(),
            governance::GovernanceError::InvalidConfigParameters.into()
        );
    }
}

#[tokio::test]
async fn test_governance_security() {
    let (mut ctx, authority, program_id) = test_utils::setup_test_context().await;
    
    // Test unauthorized treasury access
    {
        let malicious_user = Keypair::new();
        let config = test_utils::create_test_config();
        
        // Initialize governance
        let tx = governance::instruction::initialize(
            ctx.payer.pubkey(),
            authority.pubkey(),
            program_id,
            config,
        );

        ctx.banks_client
            .process_transaction(&[tx])
            .await
            .expect("Failed to initialize governance");

        // Attempt unauthorized treasury withdrawal
        let tx = governance::instruction::withdraw_treasury(
            malicious_user.pubkey(),
            program_id,
            1_000_000,
        );

        let err = ctx.banks_client
            .process_transaction(&[tx])
            .await
            .expect_err("Should fail with unauthorized access");

        assert_eq!(
            err.unwrap(),
            governance::GovernanceError::InvalidAuthority.into()
        );
    }

    // Test proposal spam protection
    {
        // Create multiple proposals in quick succession
        let proposals = (0..5).map(|_| {
            let chaos_params = governance::ChaosParameters {
                chaos_type: governance::ChaosType::FuzzTest,
                target_program: Pubkey::new_unique(),
                requires_treasury_funding: true,
                treasury_amount: 1_000_000,
                max_duration: 3600,
            };

            governance::instruction::create_chaos_proposal(
                ctx.payer.pubkey(),
                program_id,
                "Spam Test".to_string(),
                "Description".to_string(),
                chaos_params,
                7 * 24 * 60 * 60,
            )
        });

        for tx in proposals {
            let err = ctx.banks_client
                .process_transaction(&[tx])
                .await
                .expect_err("Should fail due to rate limiting");

            assert_eq!(
                err.unwrap(),
                governance::GovernanceError::ProposalRateLimitExceeded.into()
            );
        }
    }
}

#[tokio::test]
async fn test_governance_edge_cases() {
    let (mut ctx, authority, program_id) = test_utils::setup_test_context().await;
    
    // Test stake amount overflow
    {
        let tx = governance::instruction::stake_tokens(
            ctx.payer.pubkey(),
            program_id,
            u64::MAX,
        );

        let err = ctx.banks_client
            .process_transaction(&[tx])
            .await
            .expect_err("Should fail with arithmetic overflow");

        assert_eq!(
            err.unwrap(),
            governance::GovernanceError::ArithmeticError.into()
        );
    }

    // Test concurrent voting
    {
        let proposal_pubkey = Pubkey::new_unique();
        let voters: Vec<Keypair> = (0..10).map(|_| Keypair::new()).collect();
        
        let vote_txs: Vec<_> = voters.iter().map(|voter| {
            governance::instruction::cast_vote(
                voter.pubkey(),
                program_id,
                proposal_pubkey,
                true,
            )
        }).collect();

        // Process votes concurrently
        let results = futures::future::join_all(
            vote_txs.into_iter().map(|tx| ctx.banks_client.process_transaction(&[tx]))
        ).await;

        // Verify all votes were processed
        for result in results {
            result.expect("Vote should succeed");
        }
    }

    // Test delegation edge cases
    {
        // Test self-delegation
        let tx = governance::instruction::delegate_stake(
            ctx.payer.pubkey(),
            program_id,
            ctx.payer.pubkey(),
        );

        let err = ctx.banks_client
            .process_transaction(&[tx])
            .await
            .expect_err("Should fail with invalid delegation");

        assert_eq!(
            err.unwrap(),
            governance::GovernanceError::InvalidDelegation.into()
        );

        // Test delegation chain
        let delegator1 = Keypair::new();
        let delegator2 = Keypair::new();
        let delegator3 = Keypair::new();

        // Create delegation chain: delegator1 -> delegator2 -> delegator3
        let tx1 = governance::instruction::delegate_stake(
            delegator1.pubkey(),
            program_id,
            delegator2.pubkey(),
        );
        let tx2 = governance::instruction::delegate_stake(
            delegator2.pubkey(),
            program_id,
            delegator3.pubkey(),
        );

        ctx.banks_client
            .process_transaction(&[tx1])
            .await
            .expect("First delegation should succeed");

        let err = ctx.banks_client
            .process_transaction(&[tx2])
            .await
            .expect_err("Should fail with delegation chain");

        assert_eq!(
            err.unwrap(),
            governance::GovernanceError::DelegationChainNotAllowed.into()
        );
    }
}

// Add more test cases as needed... 