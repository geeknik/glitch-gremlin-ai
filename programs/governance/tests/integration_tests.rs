#![cfg(test)]
use {
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{Mint, Token, TokenAccount},
        associated_token::AssociatedToken,
    },
    solana_program::{program_pack::Pack, system_instruction},
    solana_program_test::*,
    solana_sdk::{
        signature::{Keypair, Signer},
        transaction::Transaction,
        transport::TransportError,
    },
    std::str::FromStr,
};

use governance::{
    state::*,
    monitoring::*,
    chaos::*,
    error::*,
};

// Test Constants
const STAKE_AMOUNT: u64 = 1_000_000_000; // 1 GG token
const MIN_STAKE_FOR_PROPOSAL: u64 = 100_000_000; // 0.1 GG token
const TEST_TIMEOUT: u64 = 300; // 5 minutes

struct TestContext {
    pub program: Program<Governance>,
    pub payer: Keypair,
    pub mint: Pubkey,
    pub realm: Pubkey,
    pub governance: Pubkey,
    pub stake_pool: Pubkey,
    pub monitoring: Pubkey,
}

async fn setup_test_context() -> Result<TestContext, TransportError> {
    let program_test = ProgramTest::new(
        "governance",
        governance::id(),
        processor!(governance::entry),
    );

    let mut context = program_test.start_with_context().await;
    let payer = context.payer.clone();

    // Create token mint
    let mint_keypair = Keypair::new();
    let mint = mint_keypair.pubkey();

    let tx = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &payer.pubkey(),
                &mint,
                Rent::default().minimum_balance(Mint::LEN),
                Mint::LEN as u64,
                &Token::id(),
            ),
            spl_token::instruction::initialize_mint(
                &Token::id(),
                &mint,
                &payer.pubkey(),
                None,
                9,
            )?,
        ],
        Some(&payer.pubkey()),
        &[&payer, &mint_keypair],
        context.last_blockhash,
    );
    context.banks_client.process_transaction(tx).await?;

    // Initialize governance realm
    let realm = Pubkey::find_program_address(
        &[b"realm", mint.as_ref()],
        &governance::id(),
    ).0;

    let tx = Transaction::new_signed_with_payer(
        &[governance::instruction::initialize_realm(
            governance::id(),
            payer.pubkey(),
            mint,
            "Test Realm".to_string(),
            MIN_STAKE_FOR_PROPOSAL,
        )],
        Some(&payer.pubkey()),
        &[&payer],
        context.last_blockhash,
    );
    context.banks_client.process_transaction(tx).await?;

    // Initialize stake pool
    let stake_pool = Pubkey::find_program_address(
        &[b"stake_pool", realm.as_ref()],
        &governance::id(),
    ).0;

    let tx = Transaction::new_signed_with_payer(
        &[governance::instruction::initialize_stake_pool(
            governance::id(),
            payer.pubkey(),
            realm,
            mint,
        )],
        Some(&payer.pubkey()),
        &[&payer],
        context.last_blockhash,
    );
    context.banks_client.process_transaction(tx).await?;

    // Initialize monitoring
    let monitoring = Pubkey::find_program_address(
        &[b"monitoring", realm.as_ref()],
        &governance::id(),
    ).0;

    let tx = Transaction::new_signed_with_payer(
        &[governance::instruction::initialize_monitoring(
            governance::id(),
            payer.pubkey(),
            realm,
        )],
        Some(&payer.pubkey()),
        &[&payer],
        context.last_blockhash,
    );
    context.banks_client.process_transaction(tx).await?;

    Ok(TestContext {
        program: governance::program(&context.payer),
        payer,
        mint,
        realm,
        governance: Pubkey::default(), // Will be set during governance creation
        stake_pool,
        monitoring,
    })
}

#[tokio::test]
async fn test_full_governance_flow() -> Result<(), TransportError> {
    let mut ctx = setup_test_context().await?;
    
    // Test staking tokens
    let stake_amount = STAKE_AMOUNT;
    let staker = Keypair::new();
    stake_tokens(&mut ctx, &staker, stake_amount).await?;
    
    // Create and validate proposal
    let proposal = create_test_proposal(&mut ctx, &staker).await?;
    
    // Cast votes
    cast_test_votes(&mut ctx, &proposal).await?;
    
    // Execute proposal and verify chaos test
    execute_and_verify_test(&mut ctx, &proposal).await?;
    
    Ok(())
}

async fn stake_tokens(
    ctx: &mut TestContext,
    staker: &Keypair,
    amount: u64,
) -> Result<(), TransportError> {
    // Fund staker account
    let tx = Transaction::new_signed_with_payer(
        &[system_instruction::transfer(
            &ctx.payer.pubkey(),
            &staker.pubkey(),
            1_000_000_000, // 1 SOL
        )],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.program.get_latest_blockhash(),
    );
    ctx.program.process_transaction(tx).await?;

    // Create staker's token account
    let staker_token_account = get_associated_token_address(
        &staker.pubkey(),
        &ctx.mint,
    );

    let tx = Transaction::new_signed_with_payer(
        &[create_associated_token_account(
            &ctx.payer.pubkey(),
            &staker.pubkey(),
            &ctx.mint,
        )],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.program.get_latest_blockhash(),
    );
    ctx.program.process_transaction(tx).await?;

    // Mint tokens to staker
    let tx = Transaction::new_signed_with_payer(
        &[spl_token::instruction::mint_to(
            &Token::id(),
            &ctx.mint,
            &staker_token_account,
            &ctx.payer.pubkey(),
            &[],
            amount,
        )?],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.program.get_latest_blockhash(),
    );
    ctx.program.process_transaction(tx).await?;

    // Stake tokens
    let tx = Transaction::new_signed_with_payer(
        &[governance::instruction::stake_tokens(
            governance::id(),
            ctx.realm,
            ctx.stake_pool,
            staker.pubkey(),
            staker_token_account,
            amount,
        )],
        Some(&staker.pubkey()),
        &[staker],
        ctx.program.get_latest_blockhash(),
    );
    ctx.program.process_transaction(tx).await?;

    Ok(())
}

async fn create_test_proposal(
    ctx: &mut TestContext,
    proposer: &Keypair,
) -> Result<Pubkey, TransportError> {
    // Create test specification
    let test_spec = ChaosTestSpecification {
        target_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA".to_string(),
        test_type: TestType::FuzzTransfers,
        parameters: TestParameters {
            duration_seconds: 60,
            transaction_count: 100,
            max_lamports_per_tx: 1000000,
            ..Default::default()
        },
        safety_checks: vec![
            SafetyCheck::MaxTransactionValue(1_000_000),
            SafetyCheck::RateLimit(10),
        ],
    };

    // Create proposal
    let proposal = Pubkey::find_program_address(
        &[b"proposal", ctx.realm.as_ref(), proposer.pubkey().as_ref()],
        &governance::id(),
    ).0;

    let tx = Transaction::new_signed_with_payer(
        &[governance::instruction::create_proposal(
            governance::id(),
            ctx.realm,
            proposer.pubkey(),
            "Test Chaos Engineering Proposal".to_string(),
            "Testing token program resilience".to_string(),
            test_spec,
        )],
        Some(&proposer.pubkey()),
        &[proposer],
        ctx.program.get_latest_blockhash(),
    );
    ctx.program.process_transaction(tx).await?;

    Ok(proposal)
}

async fn cast_test_votes(
    ctx: &mut TestContext,
    proposal: &Pubkey,
) -> Result<(), TransportError> {
    // Create test voters
    let voters: Vec<Keypair> = (0..3).map(|_| Keypair::new()).collect();
    
    // Stake tokens for each voter
    for voter in &voters {
        stake_tokens(ctx, voter, STAKE_AMOUNT).await?;
    }

    // Cast votes
    for voter in &voters {
        let tx = Transaction::new_signed_with_payer(
            &[governance::instruction::cast_vote(
                governance::id(),
                ctx.realm,
                *proposal,
                voter.pubkey(),
                VoteChoice::Yes,
            )],
            Some(&voter.pubkey()),
            &[voter],
            ctx.program.get_latest_blockhash(),
        );
        ctx.program.process_transaction(tx).await?;
    }

    Ok(())
}

async fn execute_and_verify_test(
    ctx: &mut TestContext,
    proposal: &Pubkey,
) -> Result<(), TransportError> {
    // Wait for voting period
    std::thread::sleep(std::time::Duration::from_secs(5));

    // Execute proposal
    let tx = Transaction::new_signed_with_payer(
        &[governance::instruction::execute_proposal(
            governance::id(),
            ctx.realm,
            *proposal,
            ctx.payer.pubkey(),
        )],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.program.get_latest_blockhash(),
    );
    ctx.program.process_transaction(tx).await?;

    // Verify test execution
    let proposal_account = ctx.program
        .get_account(*proposal)
        .await?
        .expect("Proposal account not found");
    
    let proposal_data = Proposal::try_deserialize(&mut proposal_account.data.as_ref())
        .expect("Failed to deserialize proposal");

    assert!(proposal_data.executed_at.is_some(), "Proposal not executed");
    
    // Verify monitoring data
    let monitoring_account = ctx.program
        .get_account(ctx.monitoring)
        .await?
        .expect("Monitoring account not found");
    
    let monitoring_data = SecurityMetrics::try_deserialize(&mut monitoring_account.data.as_ref())
        .expect("Failed to deserialize monitoring data");

    // Verify test results were recorded
    assert!(monitoring_data.total_tests_executed > 0, "No tests recorded");
    assert!(monitoring_data.last_test_timestamp.is_some(), "Test timestamp not recorded");

    Ok(())
}

// Additional test cases for specific scenarios
#[tokio::test]
async fn test_security_circuit_breaker() -> Result<(), TransportError> {
    let mut ctx = setup_test_context().await?;
    
    // Create malicious test specification
    let test_spec = ChaosTestSpecification {
        target_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA".to_string(),
        test_type: TestType::FuzzTransfers,
        parameters: TestParameters {
            duration_seconds: 1,
            transaction_count: 1000000, // Excessive transaction count
            max_lamports_per_tx: 1000000000, // Excessive value
            ..Default::default()
        },
        safety_checks: vec![], // No safety checks
    };

    // Attempt to create and execute malicious proposal
    let proposer = Keypair::new();
    stake_tokens(&mut ctx, &proposer, STAKE_AMOUNT).await?;
    
    // Verify circuit breaker activation
    let result = create_test_proposal(&mut ctx, &proposer).await;
    assert!(result.is_err(), "Malicious proposal should be rejected");

    // Verify security event was recorded
    let monitoring_account = ctx.program
        .get_account(ctx.monitoring)
        .await?
        .expect("Monitoring account not found");
    
    let monitoring_data = SecurityMetrics::try_deserialize(&mut monitoring_account.data.as_ref())
        .expect("Failed to deserialize monitoring data");

    assert!(monitoring_data.circuit_breaker_triggered, "Circuit breaker should be triggered");

    Ok(())
}

#[tokio::test]
async fn test_rate_limiting() -> Result<(), TransportError> {
    let mut ctx = setup_test_context().await?;
    
    // Create multiple proposals rapidly
    let proposer = Keypair::new();
    stake_tokens(&mut ctx, &proposer, STAKE_AMOUNT * 10).await?;
    
    let mut proposals = Vec::new();
    for _ in 0..5 {
        if let Ok(proposal) = create_test_proposal(&mut ctx, &proposer).await {
            proposals.push(proposal);
        }
    }

    // Verify rate limiting
    let monitoring_account = ctx.program
        .get_account(ctx.monitoring)
        .await?
        .expect("Monitoring account not found");
    
    let monitoring_data = SecurityMetrics::try_deserialize(&mut monitoring_account.data.as_ref())
        .expect("Failed to deserialize monitoring data");

    assert!(monitoring_data.rate_limit_exceeded_count > 0, "Rate limiting should be triggered");

    Ok(())
}

#[tokio::test]
async fn test_monitoring_persistence() -> Result<(), TransportError> {
    let mut ctx = setup_test_context().await?;
    
    // Execute multiple test cycles
    for _ in 0..3 {
        let proposer = Keypair::new();
        stake_tokens(&mut ctx, &proposer, STAKE_AMOUNT).await?;
        
        let proposal = create_test_proposal(&mut ctx, &proposer).await?;
        cast_test_votes(&mut ctx, &proposal).await?;
        execute_and_verify_test(&mut ctx, &proposal).await?;
    }

    // Verify metrics persistence
    let monitoring_account = ctx.program
        .get_account(ctx.monitoring)
        .await?
        .expect("Monitoring account not found");
    
    let monitoring_data = SecurityMetrics::try_deserialize(&mut monitoring_account.data.as_ref())
        .expect("Failed to deserialize monitoring data");

    assert!(monitoring_data.total_tests_executed >= 3, "Test count should persist");
    assert!(monitoring_data.successful_tests > 0, "Successful test count should be recorded");
    
    Ok(())
} 