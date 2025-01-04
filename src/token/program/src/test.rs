use {
    super::*,
    solana_program_test::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_instruction,
    },
    solana_sdk::{
        hash::Hash,
        signer::{keypair::Keypair, Signer},
        transaction::Transaction,
    },
    crate::{
        instruction::GlitchInstruction,
        state::ChaosRequest,
    },
    borsh::{BorshSerialize, BorshDeserialize},
};

// Program ID for tests
pub fn id() -> Pubkey {
    "GremLinXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
        .parse()
        .unwrap()
}

pub async fn program_test() -> (BanksClient, Keypair, Hash) {
    let program_id = Pubkey::new_unique();
    let program_test = ProgramTest::new(
        "glitch_gremlin",
        program_id,
        processor!(process_instruction),
    );
    program_test.start().await
}

#[tokio::test]
async fn test_initialize_chaos_request() {
    let (mut banks_client, payer, recent_blockhash) = program_test().await;
    let owner = Keypair::new();
    let chaos_request = Keypair::new();
    
    // Create chaos request account
    let rent = banks_client.get_rent().await.unwrap();
    let account_rent = rent.minimum_balance(std::mem::size_of::<ChaosRequest>());
    
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &chaos_request.pubkey(),
        account_rent,
        std::mem::size_of::<ChaosRequest>() as u64,
        &id(),
    );

    // Initialize chaos request
    let amount = 1000;
    let params = vec![1, 2, 3];
    let init_ix = Instruction::new_with_borsh(
        id(),
        &GlitchInstruction::InitializeChaosRequest {
            amount,
            params: params.clone(),
        },
        vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(owner.pubkey(), true),
        ],
    );

    let transaction = Transaction::new_signed_with_payer(
        &[create_account_ix, init_ix],
        Some(&payer.pubkey()),
        &[&payer, &chaos_request, &owner],
        recent_blockhash,
    );

    banks_client.process_transaction(transaction).await.unwrap();

    // Verify chaos request state
    let account = banks_client
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
async fn test_finalize_chaos_request() {
    let (mut banks_client, payer, recent_blockhash) = program_test().await;
    let finalizer = Keypair::new();
    let chaos_request = Keypair::new();
    
    // First create and initialize the chaos request
    let rent = banks_client.get_rent().await.unwrap();
    let account_rent = rent.minimum_balance(std::mem::size_of::<ChaosRequest>());
    
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &chaos_request.pubkey(),
        account_rent,
        std::mem::size_of::<ChaosRequest>() as u64,
        &id(),
    );

    // Initialize with test data
    let init_ix = Instruction::new_with_borsh(
        id(),
        &GlitchInstruction::InitializeChaosRequest {
            amount: 1000,
            params: vec![1, 2, 3],
        },
        vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(finalizer.pubkey(), true),
        ],
    );

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

    let finalize_ix = Instruction::new_with_borsh(
        id(),
        &GlitchInstruction::FinalizeChaosRequest {
            status,
            result_ref: result_ref.clone(),
        },
        vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(finalizer.pubkey(), true),
        ],
    );

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
    assert_eq!(chaos_req.result_ref, result_ref);
}
