use solana_program::pubkey::Pubkey;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer};
use std::str::FromStr;

use glitch_gremlin_ai::{
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
    
    // Setup monitoring
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