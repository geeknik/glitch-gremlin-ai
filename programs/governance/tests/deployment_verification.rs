use solana_program::pubkey::Pubkey;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer};
use glitch_gremlin_ai::chaos::{
    deployment_verifier::{DeploymentVerifier, VerificationStatus},
    governance_checks::GovernanceChecker,
};

#[tokio::test]
async fn test_deployment_verification() {
    // Initialize program test environment
    let program_id = Keypair::new();
    let mut program_test = ProgramTest::new(
        "glitch_gremlin_ai",
        program_id.pubkey(),
        processor!(process_instruction),
    );

    // Add program accounts
    let governance_key = Keypair::new();
    program_test.add_account(
        governance_key.pubkey(),
        Account {
            lamports: 1_000_000,
            data: vec![0; 1024],
            owner: program_id.pubkey(),
            executable: false,
            rent_epoch: 0,
        },
    );

    // Start program test
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create verifier
    let verifier = DeploymentVerifier::new("http://localhost:8899").unwrap();

    // Test program deployment verification
    let status = verifier.verify_deployment(&program_id.pubkey()).await.unwrap();
    assert!(status.is_deployed);
    assert!(status.is_initialized);
    assert!(status.config_valid);
    assert!(status.state_valid);
    assert!(status.issues.is_empty());
}

#[tokio::test]
async fn test_governance_security_checks() {
    // Initialize checker
    let checker = GovernanceChecker::new();

    // Test proposal creation checks
    let result = checker.check_proposal_creation(
        &Pubkey::new_unique(),
        500, // Below threshold
        0,
    );
    assert!(result.is_err());

    // Test vote casting checks
    let result = checker.check_vote_cast(
        &Pubkey::new_unique(),
        &Pubkey::new_unique(), // Untrusted mint
        1000,
        10000,
    );
    assert!(result.is_err());

    // Test quorum checks
    let result = checker.check_quorum(
        1000,
        100, // Total votes > supply
        51,
    );
    assert!(result.is_err());
}

#[tokio::test]
async fn test_deployment_monitoring() {
    // Initialize program test environment
    let program_id = Keypair::new();
    let mut program_test = ProgramTest::new(
        "glitch_gremlin_ai",
        program_id.pubkey(),
        processor!(process_instruction),
    );

    // Start program test
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create verifier
    let verifier = DeploymentVerifier::new("http://localhost:8899").unwrap();

    // Test deployment monitoring
    let health_checks = verifier.monitor_deployment(
        &program_id.pubkey(),
        std::time::Duration::from_secs(5),
    ).await.unwrap();

    assert!(!health_checks.is_empty());
    for check in health_checks {
        assert!(check.is_responsive);
        assert!(check.state_valid);
        assert!(check.issues.is_empty());
    }
}

#[tokio::test]
async fn test_security_settings() {
    // Initialize program test environment
    let program_id = Keypair::new();
    let mut program_test = ProgramTest::new(
        "glitch_gremlin_ai",
        program_id.pubkey(),
        processor!(process_instruction),
    );

    // Add program accounts with insecure settings
    let config_key = Keypair::new();
    let config_data = GovernanceConfig {
        vote_threshold_percentage: 101, // Invalid
        min_tokens_to_create_proposal: 0, // Invalid
        min_timelock_period: 60, // Too short
    };
    program_test.add_account(
        config_key.pubkey(),
        Account {
            lamports: 1_000_000,
            data: config_data.try_to_vec().unwrap(),
            owner: program_id.pubkey(),
            executable: false,
            rent_epoch: 0,
        },
    );

    // Start program test
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create verifier
    let verifier = DeploymentVerifier::new("http://localhost:8899").unwrap();

    // Test security settings verification
    let status = verifier.verify_deployment(&program_id.pubkey()).await.unwrap();
    assert!(!status.warnings.is_empty());
    assert!(status.warnings.iter().any(|w| w.contains("Timelock period")));
}

#[tokio::test]
async fn test_treasury_security() {
    // Initialize checker
    let checker = GovernanceChecker::new();

    // Test treasury operation checks
    let signers = vec![Pubkey::new_unique()];
    let result = checker.check_treasury_operation(
        1_000_000,
        1_000_000, // Attempting to drain entire treasury
        &signers,
        2, // Requires 2 signers
    );
    assert!(result.is_err());

    // Test with proper settings
    let signers = vec![Pubkey::new_unique(), Pubkey::new_unique()];
    let result = checker.check_treasury_operation(
        100_000,
        1_000_000,
        &signers,
        2,
    );
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_delegation_security() {
    // Initialize checker
    let checker = GovernanceChecker::new();

    // Test self-delegation prevention
    let key = Pubkey::new_unique();
    let result = checker.check_delegation(
        &key,
        &key, // Self-delegation attempt
        1000,
        0,
    );
    assert!(result.is_err());

    // Test delegation chain prevention
    let result = checker.check_delegation(
        &Pubkey::new_unique(),
        &Pubkey::new_unique(),
        1000,
        500, // Already has delegated tokens
    );
    assert!(result.is_err());
} 