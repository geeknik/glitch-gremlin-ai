use {
    super::*,
    solana_program_test::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_instruction,
        pubkey::Pubkey,
        program_pack::Pack,
        sysvar::clock::Clock,
    },
    solana_sdk::{
        hash::Hash,
        signer::{keypair::Keypair, Signer},
        transaction::Transaction,
        signature::Keypair,
    },
    crate::{
        instruction::GlitchInstruction,
        state::{ChaosRequest, RateLimitInfo, SecurityLevel, TestParams},
        error::GlitchError,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

use solana_program::declare_id;
declare_id!("11111111111111111111111111111111");

pub async fn program_test() -> (BanksClient, Keypair, Hash) {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "glitch_gremlin",
        program_id,
        processor!(process_instruction),
    );
    
    // Add required programs and accounts
    program_test.add_program("spl_token", spl_token::id(), None);
    program_test.add_program("spl_governance", governance::id(), None);
    
    // Initialize test mint with 1B tokens
    let mint = Keypair::new();
    program_test.add_account(mint.pubkey(), AccountSharedData::from(Account {
        lamports: 1000000000,
        data: spl_token::state::Mint::default().to_vec(),
        owner: spl_token::id(),
        executable: false,
        rent_epoch: 0,
    }));
    
    program_test.start().await
}

#[tokio::test]
async fn test_chaos_request_lifecycle() {
    let (mut banks_client, payer, recent_blockhash) = program_test().await;
    let owner = Keypair::new();
    let chaos_request = Keypair::new();
    let escrow = Keypair::new();
    let target_program = Keypair::new();

    // Create test parameters matching our new TestParams struct
    let test_params = TestParams {
        memory_fence_required: true,
        page_access_tracking: true,
        stack_canaries: true,
        audit_mode: true,
        fuzzing_strategy: "evolutionary".to_string(),
        mutation_rate: 30,
        coverage_target: 85,
        max_compute_units: 200_000,
        memory_limit: 1024 * 1024,
        max_latency: 1000,
        concurrency_level: 4,
        entropy_checks: true,
        memory_safety: 2,
        syscall_filter: vec![],
        page_quarantine: true,
        security_level: SecurityLevel::High,
    };

    // Initialize chaos request with proper security parameters
    let init_ix = Instruction {
        program_id: id(),
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(escrow.pubkey(), false),
            AccountMeta::new(owner.pubkey(), true),
            AccountMeta::new(target_program.pubkey(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: GlitchInstruction::InitializeChaosRequest {
            amount: 100_000_000,
            params: test_params,
            security_level: SecurityLevel::High,
            attestation_required: true,
        }.try_to_vec().unwrap(),
    };

    let transaction = Transaction::new_signed_with_payer(
        &[init_ix],
        Some(&payer.pubkey()),
        &[&payer, &owner],
        recent_blockhash,
    );

    banks_client.process_transaction(transaction).await.unwrap();

    // Verify initialization with updated fields
    let account = banks_client.get_account(chaos_request.pubkey()).await.unwrap().unwrap();
    let request = ChaosRequest::try_from_slice(&account.data).unwrap();
    assert_eq!(request.amount, 100_000_000);
    assert_eq!(request.security_level, SecurityLevel::High);
    assert!(request.test_params.memory_fence_required);
    assert!(request.test_params.entropy_checks);
}

#[tokio::test]
async fn test_rate_limit() {
    let mut ctx = TestContext::new().await;
    let (chaos_request, escrow, owner) = ctx.create_test_accounts().await;

    let test_params = TestParams::default();

    // Create 5 requests (under limit)
    for _ in 0..5 {
        let ix = Instruction {
            program_id: id(),
            accounts: vec![
                AccountMeta::new(chaos_request.pubkey(), false),
                AccountMeta::new(escrow.pubkey(), false),
                AccountMeta::new(owner.pubkey(), true),
                AccountMeta::new_readonly(spl_token::id(), false),
            ],
            data: GlitchInstruction::InitializeChaosRequest {
                amount: 100_000,
                params: test_params.clone(),
                security_level: SecurityLevel::High,
                attestation_required: true,
            }.try_to_vec().unwrap(),
        };

        ctx.banks_client.process_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&ctx.payer.pubkey()),
            &[&ctx.payer, &owner],
            ctx.recent_blockhash,
        )).await.unwrap();
    }
}

use crate::test_utils::TestContext;

#[tokio::test]
async fn test_initialize_chaos_request() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "glitch_gremlin",
        program_id,
        processor!(crate::processor::Processor::process),
    );

    // Generate test accounts
    let payer = Keypair::new();
    let chaos_request = Keypair::new();
    let target_program = Keypair::new();
    
    // Add test SGX quote and geographic proofs
    let sgx_quote = vec![1, 2, 3, 4];
    let geographic_proofs = vec![
        vec![1, 2, 3],
        vec![4, 5, 6],
        vec![7, 8, 9],
    ];

    let test_params = TestParams {
        memory_fence_required: true,
        audit_mode: true,
        fuzzing_strategy: "evolutionary".to_string(),
        mutation_rate: 30,
        coverage_target: 85,
        max_compute_units: 200_000,
        memory_limit: 1024 * 1024, // 1MB
    };

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create chaos request account
    let rent = banks_client.get_rent().await.unwrap();
    let account_rent = rent.minimum_balance(std::mem::size_of::<ChaosRequest>());

    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &chaos_request.pubkey(),
        account_rent,
        std::mem::size_of::<ChaosRequest>() as u64,
        &program_id,
    );

    // Test high security level request
    let instruction_data = GlitchInstruction::InitializeChaosRequest {
        amount: 10_000,
        params: test_params.clone(),
        security_level: SecurityLevel::High,
        attestation_required: true,
    }
    .try_to_vec()
    .unwrap();

    let init_ix = solana_program::instruction::Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(target_program.pubkey(), false),
        ],
        data: instruction_data,
    };

    let transaction = Transaction::new_signed_with_payer(
        &[create_account_ix, init_ix],
        Some(&payer.pubkey()),
        &[&payer, &chaos_request],
        recent_blockhash,
    );

    // Test should pass with proper security requirements
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify the created chaos request
    let chaos_request_account = banks_client
        .get_account(chaos_request.pubkey())
        .await
        .unwrap()
        .unwrap();

    let chaos_request_data = ChaosRequest::try_from_slice(&chaos_request_account.data).unwrap();
    assert_eq!(chaos_request_data.security_level, SecurityLevel::High);
    assert_eq!(chaos_request_data.test_params.memory_fence_required, true);

    // Test invalid security requirements
    let invalid_test_params = TestParams {
        memory_fence_required: false,
        ..test_params
    };

    let invalid_instruction = GlitchInstruction::InitializeChaosRequest {
        amount: 10_000,
        params: invalid_test_params,
        security_level: SecurityLevel::High,
        attestation_required: true,
    }
    .try_to_vec()
    .unwrap();

    // This should fail due to missing memory fence requirement
    let result = banks_client
        .process_transaction(Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&payer.pubkey()),
            &[&payer],
            recent_blockhash,
        ))
        .await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_initialize_chaos_request_invalid_owner() {
    let mut ctx = TestContext::new().await;
    let (chaos_request, _) = ctx.create_chaos_request_account().await;

    // Try to initialize with invalid owner (not a signer)
    let instruction_data = GlitchInstruction::InitializeChaosRequest {
        amount: 1000,
        params: vec![1, 2, 3],
    }
    .try_to_vec()
    .unwrap();

    let init_ix = Instruction {
        program_id: ctx.program_id,
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(Pubkey::new_unique(), false), // Invalid owner
        ],
        data: instruction_data,
    };

    let transaction = Transaction::new_signed_with_payer(
        &[init_ix],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.recent_blockhash,
    );

    let result = ctx.banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_finalize_chaos_request() {
    let (mut banks_client, payer, recent_blockhash) = program_test().await;
    let finalizer = Keypair::new();
    let chaos_request = Keypair::new();
    
    // Create chaos request account with proper size including Borsh overhead
    let rent = banks_client.get_rent().await.unwrap();
    // Use actual test data size for accurate calculation
    let test_request = ChaosRequest {
        owner: Pubkey::new_unique(),
        amount: 1000,
        status: 0,
        params: vec![1, 2, 3],
        result_ref: String::new(),
        escrow_account: Pubkey::new_unique(),
        rate_limit: RateLimitInfo {
            last_request: 0,
            request_count: 0,
            window_start: 0,
            failed_requests: 0,
            human_proof_nonce: [0; 32],
        },
        created_at: 0,
        completed_at: 0,
    };
    let account_size = test_request.try_to_vec().unwrap().len();
    // Add 10% buffer for safety
    let account_size_with_buffer = (account_size as f64 * 1.1) as usize;
    let account_rent = rent.minimum_balance(account_size_with_buffer);
    
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &chaos_request.pubkey(),
        account_rent,
        account_size as u64,
        &id(),
    );

    // Initialize with test data
    let instruction_data = GlitchInstruction::InitializeChaosRequest {
        amount: 1000,
        params: vec![1, 2, 3],
    }
    .try_to_vec()
    .unwrap();

    let init_ix = Instruction {
        program_id: id(),
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(finalizer.pubkey(), true),
        ],
        data: instruction_data,
    };

    let transaction = Transaction::new_signed_with_payer(
        &[create_account_ix, init_ix],
        Some(&payer.pubkey()),
        &[&payer, &chaos_request, &finalizer],
        recent_blockhash,
    );

    banks_client.process_transaction(transaction).await.unwrap();

    // Now test finalizing the request
    let result_ref = String::from("ipfs://QmTest123");
    let status = 2; // completed

    let instruction_data = GlitchInstruction::FinalizeChaosRequest {
        status,
        result_ref: result_ref.clone().into_bytes(),
    }
    .try_to_vec()
    .unwrap();

    let finalize_ix = Instruction {
        program_id: id(),
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(finalizer.pubkey(), true),
        ],
        data: instruction_data,
    };

    let transaction = Transaction::new_signed_with_payer(
        &[finalize_ix],
        Some(&payer.pubkey()),
        &[&payer, &finalizer],
        recent_blockhash,
    );

    banks_client.process_transaction(transaction).await.unwrap();

    // Verify final state
    let account = banks_client
        .get_account(chaos_request.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let chaos_req = ChaosRequest::try_from_slice(&account.data).unwrap();
    assert_eq!(chaos_req.status, status);
    assert_eq!(chaos_req.result_ref, String::from_utf8(result_ref.into()).unwrap());
}

#[tokio::test]
async fn test_validation_engine() {
    let program_id = Pubkey::new_unique();
    let mut validation_engine = ValidationEngine::new(
        AttestationManager::new(get_test_sgx_key()),
        SecurityLevel::Critical,
        ValidationMode::Paranoid,
    );

    // Test memory safety detection
    {
        let test_data = generate_test_memory_vulnerability();
        let result = validation_engine.detect_memory_safety_issues().unwrap();
        assert!(result.is_some());
        let vuln = result.unwrap();
        assert_eq!(vuln.severity, VulnerabilitySeverity::Critical);
        assert_eq!(vuln.category, VulnerabilityCategory::MemorySafety);
        assert!(vuln.cvss_score > 9.0);
    }

    // Test race condition detection
    {
        let test_data = generate_test_race_condition();
        let result = validation_engine.detect_race_conditions().unwrap();
        assert!(result.is_some());
        let vuln = result.unwrap();
        assert_eq!(vuln.severity, VulnerabilitySeverity::High);
        assert_eq!(vuln.category, VulnerabilityCategory::RaceCondition);
    }

    // Test cryptographic failure detection
    {
        let test_data = generate_test_crypto_vulnerability();
        let result = validation_engine.detect_crypto_failures().unwrap();
        assert!(result.is_some());
        let vuln = result.unwrap();
        assert_eq!(vuln.category, VulnerabilityCategory::CryptographicFailure);
        assert!(vuln.cvss_score > 8.0);
    }

    // Test report generation
    {
        let report = validation_engine.generate_validation_report(&program_id).unwrap();
        assert!(!report.vulnerabilities.is_empty());
        assert!(report.security_metrics.coverage_percentage > 0);
        assert_ne!(report.report_hash, [0u8; 32]);
    }
}

#[test]
fn test_vulnerability_metrics() {
    let mut metrics = VulnerabilityMetrics::default();
    
    // Test vulnerability density calculation
    {
        let test_data = vec![0xFF, 0x00, 0xFF];
        let count = count_vulnerabilities(&test_data);
        assert_eq!(count, 2);
    }

    // Test attack surface calculation
    {
        let test_data = generate_test_attack_surface();
        let score = calculate_attack_surface(&test_data).unwrap();
        assert!(score > 0.0 && score <= 10.0);
    }
}

// Helper functions for generating test data
fn generate_test_memory_vulnerability() -> Vec<u8> {
    let mut data = Vec::with_capacity(1024);
    // Simulate buffer overflow condition
    data.extend_from_slice(&[0xFF; 2048]);
    data
}

fn generate_test_race_condition() -> Vec<u8> {
    let mut data = Vec::new();
    // Simulate concurrent account access
    data.extend_from_slice(&[0x01, 0x02, 0x01, 0x02]);
    data
}

fn generate_test_crypto_vulnerability() -> Vec<u8> {
    let mut data = Vec::new();
    // Simulate weak entropy
    data.extend_from_slice(&[0x00; 32]);
    data
}

fn generate_test_attack_surface() -> Vec<u8> {
    let mut data = Vec::new();
    // Simulate various attack vectors
    data.extend_from_slice(&[0x01, 0x02, 0x03, 0xFF]);
    data
}

fn get_test_sgx_key() -> PublicKey {
    // Generate test SGX key for attestation
    let keypair = Keypair::new();
    keypair.public_key()
}

#[test]
fn test_report_generation() {
    let program_id = Pubkey::new_unique();
    let security_metrics = SecurityMetrics {
        vulnerability_density: 0.5,
        time_to_detection: 100,
        false_positive_rate: 0.01,
        false_negative_rate: 0.02,
        exploit_complexity_score: 75,
        attack_surface_area: 6.5,
        coverage_percentage: 85,
    };

    let report = ValidationReport::new(
        program_id,
        security_metrics,
        vec![generate_test_vulnerability()],
        vec![generate_test_attestation()],
    ).unwrap();

    let markdown = report.to_markdown();
    assert!(markdown.contains("Security Validation Report"));
    assert!(markdown.contains(&program_id.to_string()));
    assert!(markdown.contains("85%")); // Coverage
}

fn generate_test_vulnerability() -> Vulnerability {
    Vulnerability {
        severity: VulnerabilitySeverity::Critical,
        category: VulnerabilityCategory::MemorySafety,
        location: CodeLocation {
            instruction_index: 0,
            offset: 32,
            context: "Test vulnerability".to_string(),
        },
        exploit_chain: vec![ExploitStep {
            description: "Test exploit".to_string(),
            preconditions: vec!["Test condition".to_string()],
            technical_impact: "Test impact".to_string(),
        }],
        cvss_score: 9.8,
    }
}

fn generate_test_attestation() -> Attestation {
    Attestation {
        validator_pubkey: Pubkey::new_unique(),
        timestamp: 1234567890,
        signature: [0u8; 64],
    }
}
