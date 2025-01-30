#![cfg(test)]
use {
    anchor_lang::{prelude::*, solana_program::clock::Clock},
    anchor_spl::token::{self, Token},
    governance::{
        chaos::{
            test_runner::ChaosTestRunner,
            Finding, FindingSeverity, FindingCategory,
            ChaosTestResult,
        },
        monitoring::SecurityMetrics,
    },
    solana_program_test::*,
    solana_sdk::{signature::Keypair, signer::Signer},
    solana_program::{
        instruction::Instruction,
        program_error::ProgramError,
        pubkey::Pubkey,
    },
};

#[tokio::test]
async fn test_fuzz_testing() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "governance",
        program_id,
        processor!(governance::entry),
    );

    // Create test context
    let mut context = program_test.start_with_context().await;
    let payer = context.payer.clone();

    // Create a dummy target program for testing
    let target_program = Keypair::new();
    let target_program_id = target_program.pubkey();

    // Initialize test parameters
    let params = ChaosParameters {
        chaos_type: governance::state::ChaosType::FuzzTest,
        target_program: target_program_id,
        requires_treasury_funding: false,
        treasury_amount: 0,
        max_duration: 10, // 10 seconds
    };

    // Create test context
    let test_context = ChaosTestContext {
        target_program: target_program_id.clone(),
        payer: payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };

    // Initialize chaos test
    let mut chaos_test = ChaosTest::new(test_context, params);

    // Run fuzz test
    let result = chaos_test.run_fuzz_test().unwrap();

    // Verify results
    assert!(result.success);
    assert_eq!(result.error_count, 0);
    assert!(result.total_transactions > 0);
    assert!(result.duration <= 10);
}

#[tokio::test]
async fn test_load_testing() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "governance",
        program_id,
        processor!(governance::entry),
    );

    let mut context = program_test.start_with_context().await;
    let payer = context.payer.clone();
    let target_program = Keypair::new();
    let target_program_id = target_program.pubkey();

    let params = ChaosParameters {
        chaos_type: governance::state::ChaosType::LoadTest,
        target_program: target_program_id,
        requires_treasury_funding: false,
        treasury_amount: 0,
        max_duration: 10,
    };

    let test_context = ChaosTestContext {
        target_program: target_program_id.clone(),
        payer: payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };

    let mut chaos_test = ChaosTest::new(test_context, params);
    let result = chaos_test.run_load_test().unwrap();

    assert!(result.success);
    assert!(result.total_transactions > 0);
    assert!(result.duration <= 10);
}

#[tokio::test]
async fn test_security_audit() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "governance",
        program_id,
        processor!(governance::entry),
    );

    let mut context = program_test.start_with_context().await;
    let payer = context.payer.clone();
    let target_program = Keypair::new();
    let target_program_id = target_program.pubkey();

    let params = ChaosParameters {
        chaos_type: governance::state::ChaosType::SecurityAudit,
        target_program: target_program_id,
        requires_treasury_funding: false,
        treasury_amount: 0,
        max_duration: 10,
    };

    let test_context = ChaosTestContext {
        target_program: target_program_id.clone(),
        payer: payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };

    let mut chaos_test = ChaosTest::new(test_context, params);
    let result = chaos_test.run_security_audit().unwrap();

    assert!(result.success);
    assert_eq!(result.error_count, 0);
}

#[tokio::test]
async fn test_concurrency_testing() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "governance",
        program_id,
        processor!(governance::entry),
    );

    let mut context = program_test.start_with_context().await;
    let payer = context.payer.clone();
    let target_program = Keypair::new();
    let target_program_id = target_program.pubkey();

    let params = ChaosParameters {
        chaos_type: governance::state::ChaosType::ConcurrencyTest,
        target_program: target_program_id,
        requires_treasury_funding: false,
        treasury_amount: 0,
        max_duration: 10,
    };

    let test_context = ChaosTestContext {
        target_program: target_program_id.clone(),
        payer: payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };

    let mut chaos_test = ChaosTest::new(test_context, params);
    let result = chaos_test.run_concurrency_test().unwrap();

    assert!(result.success);
    assert_eq!(result.error_count, 0);
    assert!(result.total_transactions > 0);
}

#[tokio::test]
async fn test_finding_recording() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "governance",
        program_id,
        processor!(governance::entry),
    );

    let mut context = program_test.start_with_context().await;
    let payer = context.payer.clone();
    let target_program = Keypair::new();
    let target_program_id = target_program.pubkey();

    let params = ChaosParameters {
        chaos_type: governance::state::ChaosType::SecurityAudit,
        target_program: target_program_id,
        requires_treasury_funding: false,
        treasury_amount: 0,
        max_duration: 10,
    };

    let test_context = ChaosTestContext {
        target_program: target_program_id.clone(),
        payer: payer.pubkey(),
        system_program: solana_program::system_program::id(),
    };

    let mut chaos_test = ChaosTest::new(test_context, params);
    
    // Manually record some findings
    chaos_test.record_finding(Finding {
        severity: FindingSeverity::Critical,
        category: FindingCategory::SecurityVulnerability,
        description: "Critical security vulnerability found".to_string(),
        transaction_signature: Some("test_signature".to_string()),
    });

    chaos_test.record_finding(Finding {
        severity: FindingSeverity::Medium,
        category: FindingCategory::PerformanceIssue,
        description: "Performance bottleneck detected".to_string(),
        transaction_signature: None,
    });

    let result = chaos_test.run_security_audit().unwrap();

    assert_eq!(result.findings.len(), 2);
    assert_eq!(result.findings[0].severity, FindingSeverity::Critical);
    assert_eq!(result.findings[1].category, FindingCategory::PerformanceIssue);
}

#[tokio::test]
async fn test_chaos_runner_metrics() {
    let program_id = Pubkey::new_unique();
    let mut runner = ChaosTestRunner::new(program_id);
    
    // Test successful execution
    let instruction = Instruction {
        program_id,
        accounts: vec![],
        data: vec![],
    };
    
    let result = runner.execute_test(instruction.clone(), vec![]).await;
    assert!(result.is_ok());
    
    let metrics = runner.get_metrics();
    assert_eq!(metrics.total_executions, 1);
    assert_eq!(metrics.failed_executions, 0);
}

#[tokio::test]
async fn test_security_metrics_arithmetic() {
    let mut metrics = SecurityMetrics::new();
    
    // Test vote recording
    let voter = Pubkey::new_unique();
    assert!(metrics.record_vote(voter).is_ok());
    assert_eq!(metrics.total_votes, 1);
    assert!(metrics.unique_voters.contains(&voter));
    
    // Test treasury operation recording
    assert!(metrics.record_treasury_operation(true, 1000).is_ok());
    assert_eq!(metrics.treasury_operations.successful_operations, 1);
    assert_eq!(metrics.treasury_operations.total_volume, 1000);
}

#[tokio::test]
async fn test_finding_generation() {
    let program_id = Pubkey::new_unique();
    let finding = Finding::new(
        program_id,
        "Test finding".to_string(),
        FindingSeverity::High,
    );
    
    assert_eq!(finding.program_id, program_id);
    assert_eq!(finding.severity, FindingSeverity::High);
    assert_eq!(finding.details, "Test finding");
}

#[tokio::test]
async fn test_execution_anomalies() {
    let program_id = Pubkey::new_unique();
    let mut runner = ChaosTestRunner::new(program_id);
    
    // Test high cost execution
    let instruction = Instruction {
        program_id,
        accounts: vec![],
        data: vec![0; 1000], // Large data to simulate high cost
    };
    
    let result = runner.execute_test(instruction, vec![]).await;
    assert!(result.is_ok());
    
    let (finding, _) = result.unwrap();
    assert!(finding.is_some());
    
    let finding = finding.unwrap();
    assert_eq!(finding.severity, FindingSeverity::High);
}

#[tokio::test]
async fn test_error_analysis() {
    let program_id = Pubkey::new_unique();
    let mut runner = ChaosTestRunner::new(program_id);
    
    // Test invalid account data error
    let instruction = Instruction {
        program_id,
        accounts: vec![],
        data: vec![],
    };
    
    let result = runner.execute_test(instruction, vec![]).await;
    assert!(result.is_err());
    
    let metrics = runner.get_metrics();
    assert_eq!(metrics.failed_executions, 1);
}

#[tokio::test]
async fn test_arithmetic_overflow_protection() {
    let mut metrics = SecurityMetrics::new();
    
    // Test overflow protection in vote recording
    for _ in 0..u64::MAX {
        if metrics.record_vote(Pubkey::new_unique()).is_err() {
            // Should error on overflow
            return;
        }
    }
    
    panic!("Overflow protection failed");
}

#[tokio::test]
async fn test_chaos_test_result_generation() {
    let program_id = Pubkey::new_unique();
    let mut runner = ChaosTestRunner::new(program_id);
    
    let instruction = Instruction {
        program_id,
        accounts: vec![],
        data: vec![],
    };
    
    let result = runner.execute_test(instruction, vec![]).await;
    assert!(result.is_ok());
    
    let metrics = runner.get_metrics();
    assert!(metrics.total_executions > 0);
} 