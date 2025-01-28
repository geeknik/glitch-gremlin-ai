use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
};
use solana_program_test::*;
use solana_sdk::{
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};
use glitch_gremlin::{
    processor::Processor,
    state::{SecurityLevel, TestParams, ValidationMode},
    instruction::GlitchInstruction,
    validation::ValidationEngine,
    attestation::AttestationManager,
};

#[tokio::test]
async fn test_full_chaos_workflow() {
    // Initialize the test environment
    let program_id = Pubkey::new_unique();
    let (mut banks_client, payer, recent_blockhash) = ProgramTest::new(
        "glitch_gremlin",
        program_id,
        processor!(Processor::process_instruction),
    )
    .start()
    .await;

    // Create test accounts
    let chaos_request = Keypair::new();
    let target_program = Keypair::new();
    let escrow_account = Keypair::new();
    let rate_limit_account = Keypair::new();

    // Setup test parameters
    let test_params = TestParams {
        memory_fence_required: true,
        page_access_tracking: true,
        stack_canaries: true,
        security_level: SecurityLevel::Critical,
        test_duration: 3600,
        parallel_execution: true,
        retry_count: 3,
        timeout: 300,
        validation_mode: ValidationMode::Paranoid,
        max_compute_units: 200_000,
        memory_limit: 256 * 1024 * 1024,
    };

    // Initialize chaos request
    let init_ix = GlitchInstruction::InitializeChaosRequest {
        amount: 1000000,
        params: test_params.clone(),
        security_level: SecurityLevel::Critical,
        attestation_required: true,
    };

    let accounts = vec![
        AccountMeta::new(chaos_request.pubkey(), true),
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new(escrow_account.pubkey(), false),
        AccountMeta::new(target_program.pubkey(), false),
        AccountMeta::new(rate_limit_account.pubkey(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_borsh(
            program_id,
            &init_ix,
            accounts,
        )],
        Some(&payer.pubkey()),
        &[&payer, &chaos_request],
        recent_blockhash,
    );

    banks_client.process_transaction(transaction).await.unwrap();

    // Execute chaos test
    let test_result = execute_chaos_test(&mut banks_client, &chaos_request.pubkey()).await;
    assert!(test_result.is_ok());

    // Validate results
    let validation_engine = ValidationEngine::new(
        AttestationManager::new(payer.pubkey()),
        SecurityLevel::Critical,
        ValidationMode::Paranoid,
    );

    let validation_result = validate_test_results(
        &mut banks_client,
        &validation_engine,
        &chaos_request.pubkey(),
    ).await;
    assert!(validation_result.is_ok());

    // Verify final state
    let final_state = get_chaos_request_state(
        &mut banks_client,
        &chaos_request.pubkey(),
    ).await;
    assert!(final_state.is_ok());
}

async fn execute_chaos_test(
    banks_client: &mut BanksClient,
    chaos_request: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    // Execute test cases
    let test_cases = generate_test_cases();
    
    for test_case in test_cases {
        let result = execute_single_test(banks_client, chaos_request, &test_case).await?;
        assert!(result.success);
    }

    Ok(())
}

async fn validate_test_results(
    banks_client: &mut BanksClient,
    validation_engine: &ValidationEngine,
    chaos_request: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let results = get_test_results(banks_client, chaos_request).await?;
    let report = validation_engine.generate_validation_report(chaos_request)?;
    
    // Verify report contents
    assert!(report.security_metrics.coverage_percentage >= 85);
    assert!(report.security_metrics.vulnerability_density < 0.5);
    assert!(report.attestations.len() >= 7); // 7/10 multisig requirement

    Ok(())
}

// Helper functions
async fn execute_single_test(
    banks_client: &mut BanksClient,
    chaos_request: &Pubkey,
    test_case: &TestParams,
) -> Result<TestResult, Box<dyn std::error::Error>> {
    let instruction = GlitchInstruction::ExecuteTest {
        params: test_case.clone(),
    };
    
    let transaction = Transaction::new_with_payer(
        &[instruction.into()],
        Some(chaos_request),
    );

    banks_client.process_transaction(transaction).await?;
    
    Ok(TestResult { success: true })
}

async fn get_chaos_request_state(
    banks_client: &mut BanksClient,
    chaos_request: &Pubkey,
) -> Result<ChaosRequestState, Box<dyn std::error::Error>> {
    let account = banks_client.get_account(*chaos_request).await?
        .ok_or("Chaos request account not found")?;
    
    let state = ChaosRequestState::try_from_slice(&account.data)?;
    Ok(state)
}

async fn get_test_results(
    banks_client: &mut BanksClient,
    chaos_request: &Pubkey,
) -> Result<Vec<TestResult>, Box<dyn std::error::Error>> {
    let account = banks_client.get_account(*chaos_request).await?
        .ok_or("Chaos request account not found")?;
    
    let state = ChaosRequestState::try_from_slice(&account.data)?;
    Ok(state.test_results)
}

impl TestParams {
    fn new(
        name: &str,
        target_instruction: u8,
        input_data: Vec<u8>,
        expected_result: ExpectedResult,
    ) -> Self {
        Self {
            name: name.to_string(),
            target_instruction,
            input_data,
            expected_result,
            security_level: SecurityLevel::Critical,
            validation_mode: ValidationMode::Paranoid,
        }
    }
}

fn generate_test_cases() -> Vec<TestParams> {
    vec![
        TestParams {
            security_level: SecurityLevel::Low,
            test_duration: 300,
            max_compute_units: 50_000,
            ..Default::default()
        },
        TestParams {
            security_level: SecurityLevel::High,
            test_duration: 600,
            max_compute_units: 200_000,
            memory_limit: 512 * 1024
        },
    ]
}

#[derive(Debug, PartialEq)]
enum ExpectedResult {
    ShouldSucceed,
    ShouldFail,
}

struct TestParams {
    name: String,
    target_instruction: u8,
    input_data: Vec<u8>,
    expected_result: ExpectedResult,
    security_level: SecurityLevel,
    validation_mode: ValidationMode,
}

struct TestResult {
    success: bool,
} 