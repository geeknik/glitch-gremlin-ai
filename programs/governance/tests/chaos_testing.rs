#![cfg(test)]
use {
    anchor_lang::{prelude::*, solana_program::clock::Clock},
    anchor_spl::token::{self, Token},
    governance::{
        chaos::testing::{ChaosTest, ChaosTestContext, ChaosTestResult, Finding, FindingSeverity, FindingCategory},
        state::ChaosParameters,
    },
    solana_program_test::*,
    solana_sdk::{signature::Keypair, signer::Signer},
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