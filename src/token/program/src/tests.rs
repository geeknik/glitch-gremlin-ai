use {
    super::*,
    solana_program_test::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_instruction,
        pubkey::Pubkey,
    },
    solana_sdk::{
        hash::Hash,
        signer::{keypair::Keypair, Signer},
        transaction::Transaction,
    },
    crate::{
        instruction::GlitchInstruction,
        state::{ChaosRequest, RateLimitInfo},
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
    let (mut banks_client, payer, _) = program_test().await;
    let owner = Keypair::new();
    let chaos_request = Keypair::new();
    let escrow = Keypair::new();

    // Initialize token account
    let init_ix = system_instruction::create_account(
        &payer.pubkey(),
        &escrow.pubkey(),
        1000000000,
        1000,
        &spl_token::id(),
    );
    banks_client.process_transaction(Transaction::new_with_payer(
        &[init_ix],
        Some(&payer.pubkey()),
    )).await.unwrap();

    // Create chaos request
    let create_ix = Instruction {
        program_id: id(),
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(escrow.pubkey(), false),
            AccountMeta::new(owner.pubkey(), true),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: GlitchInstruction::InitializeChaosRequest {
            amount: 100_000_000,
            params: vec![0u8; 32],
        }.try_to_vec().unwrap(),
    };

    banks_client.process_transaction(Transaction::new_with_payer(
        &[create_ix],
        Some(&payer.pubkey()),
    )).await.unwrap();

    // Verify initialization
    let account = banks_client.get_account(chaos_request.pubkey()).await.unwrap().unwrap();
    let request = ChaosRequest::try_from_slice(&account.data).unwrap();
    assert_eq!(request.amount, 100_000_000);
    assert_eq!(request.status, 0);

    // Finalize request
    let finalize_ix = Instruction {
        program_id: id(),
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new_readonly(owner.pubkey(), true),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: GlitchInstruction::FinalizeChaosRequest {
            status: 2,
            result_ref: b"ipfs://QmTest".to_vec(),
        }.try_to_vec().unwrap(),
    };

    banks_client.process_transaction(Transaction::new_with_payer(
        &[finalize_ix],
        Some(&payer.pubkey()),
    )).await.unwrap();

    // Verify finalization
    let account = banks_client.get_account(chaos_request.pubkey()).await.unwrap().unwrap();
    let request = ChaosRequest::try_from_slice(&account.data).unwrap();
    assert_eq!(request.status, 2);
    assert!(!request.result_ref.is_empty());
}

#[tokio::test]
async fn test_rate_limiting() {
    let (mut banks_client, payer, _) = program_test().await;
    let owner = Keypair::new();
    let chaos_request = Keypair::new();
    let escrow = Keypair::new();

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
                params: vec![0u8; 32],
            }.try_to_vec().unwrap(),
        };

        banks_client.process_transaction(Transaction::new_with_payer(
            &[ix],
            Some(&payer.pubkey()),
        )).await.unwrap();
    }

    // 6th request should fail
    let result = banks_client.process_transaction(Transaction::new_with_payer(
        &[Instruction {
            program_id: id(),
            accounts: vec![
                AccountMeta::new(chaos_request.pubkey(), false),
                AccountMeta::new(escrow.pubkey(), false),
                AccountMeta::new(owner.pubkey(), true),
                AccountMeta::new_readonly(spl_token::id(), false),
            ],
            data: GlitchInstruction::InitializeChaosRequest {
                amount: 100_000,
                params: vec![0u8; 32],
            }.try_to_vec().unwrap(),
        }],
        Some(&payer.pubkey()),
    )).await;

    assert!(matches!(result, Err(TransportError::TransactionError(
        TransactionError::InstructionError(_, InstructionError::Custom(err)))
        if err == GlitchError::RateLimitExceeded as u32)));
}

pub struct TestContext {
    pub banks_client: BanksClient,
    pub payer: Keypair,
    pub recent_blockhash: Hash,
    pub program_id: Pubkey,
}

impl TestContext {
    pub async fn new() -> Self {
        let program_id = Pubkey::new_unique();
        let program_test = ProgramTest::new(
            "glitch_gremlin",
            program_id,
            processor!(process_instruction),
        );
        let (banks_client, payer, recent_blockhash) = program_test.start().await;
        Self {
            banks_client,
            payer,
            recent_blockhash,
            program_id,
        }
    }

    pub async fn create_chaos_request_account(&mut self) -> (Keypair, u64) {
        let rent = self.banks_client.get_rent().await.unwrap();
        let chaos_request = Keypair::new();
        
        // Calculate account size using actual data
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
            },
        };
        let account_size = test_request.try_to_vec().unwrap().len();
        let account_rent = rent.minimum_balance(account_size);
        
        let create_account_ix = system_instruction::create_account(
            &self.payer.pubkey(),
            &chaos_request.pubkey(),
            account_rent,
            account_size as u64,
            &self.program_id,
        );

        let transaction = Transaction::new_signed_with_payer(
            &[create_account_ix],
            Some(&self.payer.pubkey()),
            &[&self.payer, &chaos_request],
            self.recent_blockhash,
        );

        self.banks_client.process_transaction(transaction).await.unwrap();
        
        (chaos_request, account_rent)
    }
}

#[tokio::test]
async fn test_initialize_chaos_request() {
    let mut ctx = TestContext::new().await;
    let owner = Keypair::new();
    let (chaos_request, _) = ctx.create_chaos_request_account().await;

    // Initialize chaos request
    let amount = 1000;
    let params = vec![1, 2, 3];
    let instruction_data = GlitchInstruction::InitializeChaosRequest {
        amount,
        params: params.clone(),
    }
    .try_to_vec()
    .unwrap();

    let init_ix = Instruction {
        program_id: ctx.program_id,
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(owner.pubkey(), true),
        ],
        data: instruction_data,
    };

    let transaction = Transaction::new_signed_with_payer(
        &[init_ix],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer, &owner],
        ctx.recent_blockhash,
    );

    ctx.banks_client.process_transaction(transaction).await.unwrap();

    // Verify chaos request state
    let account = ctx.banks_client
        .get_account(chaos_request.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let chaos_req = ChaosRequest::try_from_slice(&account.data).unwrap();
    assert_eq!(chaos_req.owner, owner.pubkey());
    assert_eq!(chaos_req.amount, amount);
    assert_eq!(chaos_req.status, 0);
    assert_eq!(chaos_req.params, params);
    assert_eq!(chaos_req.result_ref, String::new());
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
