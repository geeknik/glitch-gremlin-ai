use solana_program::pubkey::Pubkey;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer};
use glitch_gremlin_ai::monitoring::{
    MonitoringSystem,
    blockchain_monitor::GovernanceEvent,
    proposal_tracker::TestResults,
};
use std::collections::HashMap;
use std::str::FromStr;

use governance::{
    monitoring::{
        dashboard::SecurityDashboard,
        auto_response::{AutoResponse, ResponseConfig, DefenseLevel},
    },
    chaos::governance_checks::{GovernanceChecker, GovernanceOperation},
};

#[tokio::test]
async fn test_governance_security_integration() {
    // Initialize test environment
    let program_id = Pubkey::new_unique();
    let mut checker = GovernanceChecker::new();
    
    // Setup monitoring with remote Redis
    let dashboard = SecurityDashboard::new("test_rrd").expect("Failed to create dashboard");
    let config = ResponseConfig {
        auto_block_threshold: 5,
        rate_limit_increase_threshold: 10,
        emergency_halt_threshold: 20,
        admin_notification_threshold: 3,
        notification_endpoints: vec!["test_endpoint".to_string()],
    };
    let mut auto_response = AutoResponse::new(config);

    // Test 1: Normal governance operation
    let proposer = Keypair::new();
    let operation = GovernanceOperation::CreateProposal {
        proposer: proposer.pubkey(),
        token_amount: 5000,
        active_proposals: 1,
    };
    assert!(checker.check_governance_operation(&operation).is_ok());

    // Test 2: Detect and respond to vote manipulation
    let voter = Keypair::new();
    let token_mint = Pubkey::new_unique();
    for _ in 0..6 {
        let operation = GovernanceOperation::CastVote {
            voter: voter.pubkey(),
            token_mint,
            vote_weight: 1000,
            total_supply: 10000,
        };
        let _ = checker.check_governance_operation(&operation);
    }
    
    // Test 3: Treasury operation with security checks
    let operation = GovernanceOperation::TreasuryTransfer {
        amount: 5000,
        balance: 10000,
        signers: vec![proposer.pubkey()],
        required_signers: 2,
    };
    assert!(checker.check_governance_operation(&operation).is_err());

    // Test 4: Test automated response to security events
    let metrics = checker.get_metrics();
    let status = dashboard.get_security_status().await;
    let actions = auto_response.process_security_status(
        status.get(&program_id).expect("Status not found")
    ).await;

    // Verify automated responses
    assert!(!actions.is_empty());
    for action in actions {
        match action {
            SecurityAction::EnableDefenseMode { defense_level, .. } => {
                assert_eq!(defense_level, DefenseLevel::Enhanced);
            }
            SecurityAction::NotifyAdmins { severity, .. } => {
                assert!(severity >= AlertLevel::Medium);
            }
            _ => {}
        }
    }

    // Test 5: Verify metrics collection
    let metrics = checker.get_metrics();
    assert!(metrics.total_votes > 0);
    assert!(metrics.exploit_attempts.values().sum::<u64>() > 0);

    // Test 6: Test emergency response
    let operation = GovernanceOperation::CreateProposal {
        proposer: proposer.pubkey(),
        token_amount: 100,  // Below threshold
        active_proposals: 10, // Too many active proposals
    };
    assert!(checker.check_governance_operation(&operation).is_err());

    // Verify emergency halt is triggered
    let status = dashboard.get_security_status().await;
    let actions = auto_response.process_security_status(
        status.get(&program_id).expect("Status not found")
    ).await;
    
    assert!(actions.iter().any(|action| matches!(
        action,
        SecurityAction::EmergencyHalt { .. }
    )));
}

#[tokio::test]
async fn test_defense_mode_transitions() {
    let program_id = Pubkey::new_unique();
    let mut checker = GovernanceChecker::new();
    let dashboard = SecurityDashboard::new("test_rrd").expect("Failed to create dashboard");
    let config = ResponseConfig {
        auto_block_threshold: 3,
        rate_limit_increase_threshold: 5,
        emergency_halt_threshold: 10,
        admin_notification_threshold: 2,
        notification_endpoints: vec!["test_endpoint".to_string()],
    };
    let mut auto_response = AutoResponse::new(config);

    // Test defense mode escalation
    let mut test_escalation = |attempts: u32, expected_level: DefenseLevel| async move {
        for _ in 0..attempts {
            let operation = GovernanceOperation::CreateProposal {
                proposer: Keypair::new().pubkey(),
                token_amount: 100,
                active_proposals: 1,
            };
            let _ = checker.check_governance_operation(&operation);
        }

        let status = dashboard.get_security_status().await;
        let actions = auto_response.process_security_status(
            status.get(&program_id).expect("Status not found")
        ).await;

        assert!(actions.iter().any(|action| matches!(
            action,
            SecurityAction::EnableDefenseMode { defense_level, .. } if *defense_level == expected_level
        )));
    };

    // Test escalation levels
    test_escalation(3, DefenseLevel::Enhanced).await;
    test_escalation(6, DefenseLevel::Strict).await;
    test_escalation(11, DefenseLevel::Lockdown).await;
}

#[tokio::test]
async fn test_adaptive_rate_limiting() {
    let program_id = Pubkey::new_unique();
    let mut checker = GovernanceChecker::new();
    let dashboard = SecurityDashboard::new("test_rrd").expect("Failed to create dashboard");
    let config = ResponseConfig {
        auto_block_threshold: 3,
        rate_limit_increase_threshold: 5,
        emergency_halt_threshold: 10,
        admin_notification_threshold: 2,
        notification_endpoints: vec!["test_endpoint".to_string()],
    };
    let mut auto_response = AutoResponse::new(config);

    // Test rate limit adaptation
    let test_rate_limit = |operations: u32, expected_limit: u32| async move {
        for _ in 0..operations {
            let operation = GovernanceOperation::CreateProposal {
                proposer: Keypair::new().pubkey(),
                token_amount: 1000,
                active_proposals: 1,
            };
            let _ = checker.check_governance_operation(&operation);
        }

        let status = dashboard.get_security_status().await;
        let actions = auto_response.process_security_status(
            status.get(&program_id).expect("Status not found")
        ).await;

        let new_limit = auto_response.get_rate_limit(&program_id).await;
        assert_eq!(new_limit, expected_limit);
    };

    // Test progressive rate limit increases
    test_rate_limit(5, 15).await;  // Initial increase
    test_rate_limit(10, 22).await; // Second increase
    test_rate_limit(15, 33).await; // Third increase
}

#[tokio::test]
async fn test_monitoring_system_integration() {
    // Initialize test environment
    let program_id = Pubkey::new_unique();
    let test_rpc = "http://localhost:8899".to_string();
    let test_redis = "redis://r.glitchgremlin.ai:6379".to_string();
    let test_groq = std::env::var("GROQ_API_KEY").unwrap_or("test_key".to_string());

    // Create monitoring system
    let monitoring = MonitoringSystem::new(
        program_id,
        test_rpc,
        test_redis.clone(),
        test_groq,
    ).await.unwrap();

    // Create test proposal event
    let proposer = Keypair::new();
    let proposal_key = Pubkey::new_unique();
    
    let proposal = GovernanceEvent::ProposalCreated {
        key: proposal_key,
        proposer: proposer.pubkey(),
        title: "Test Proposal".to_string(),
        description: "Testing chaos parameters".to_string(),
        chaos_params: Default::default(),
    };

    // Track proposal
    monitoring.proposal_tracker.write().await
        .track_proposal(proposal.clone())
        .await
        .unwrap();

    // Verify proposal is tracked
    let metrics = monitoring.proposal_tracker.read().await
        .get_metrics()
        .await
        .unwrap();
    
    assert_eq!(metrics.total_proposals, 1);
    assert_eq!(metrics.active_proposals, 1);

    // Get AI recommendation
    let recommendation = monitoring.ai_integration.read().await
        .get_test_recommendation(&proposal)
        .await
        .unwrap();

    assert!(!recommendation.execution_steps.is_empty());
    assert!(!recommendation.security_considerations.is_empty());

    // Complete test execution
    let test_results = TestResults {
        success: true,
        metrics: HashMap::from([
            ("execution_time".to_string(), 1.5),
            ("resource_usage".to_string(), 75.0),
        ]),
        logs: vec!["Test completed successfully".to_string()],
        vulnerabilities: vec![],
    };

    monitoring.proposal_tracker.write().await
        .complete_execution(proposal_key, test_results)
        .await
        .unwrap();

    // Verify metrics are updated
    let final_metrics = monitoring.proposal_tracker.read().await
        .get_metrics()
        .await
        .unwrap();

    assert_eq!(final_metrics.active_proposals, 0);
    assert_eq!(final_metrics.executed_proposals, 1);
    assert!(final_metrics.avg_execution_time > 0.0);
}

#[tokio::test]
async fn test_security_analysis() {
    let test_groq = std::env::var("GROQ_API_KEY").unwrap_or("test_key".to_string());
    let monitoring = MonitoringSystem::new(
        Pubkey::new_unique(),
        "http://localhost:8899".to_string(),
        "redis://r.glitchgremlin.ai:6379".to_string(),
        test_groq,
    ).await.unwrap();

    let program_id = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
    let test_code = r#"
        pub fn process_instruction(
            program_id: &Pubkey,
            accounts: &[AccountInfo],
            instruction_data: &[u8],
        ) -> ProgramResult {
            let account = next_account_info(accounts)?;
            let data = account.try_borrow_mut_data()?;
            data[0] = instruction_data[0];
            Ok(())
        }
    "#;

    let findings = monitoring.ai_integration.read().await
        .get_security_analysis(program_id, test_code)
        .await
        .unwrap();

    assert!(!findings.is_empty());
    assert!(findings.iter().any(|f| f.contains("validation")));
} 