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
    borsh::{BorshDeserialize, BorshSerialize},
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
    
    // Create chaos request account with proper size including Borsh overhead
    let rent = banks_client.get_rent().await.unwrap();
    let dummy_request = ChaosRequest {
        owner: Pubkey::new_unique(),
        amount: 0,
        status: 0,
        params: vec![], // Empty params for base size
        result_ref: String::new(),
    };
    let account_size = dummy_request.try_to_vec().unwrap().len();
    let account_rent = rent.minimum_balance(account_size);
    
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &chaos_request.pubkey(),
        account_rent,
        account_size as u64,
        &id(),
    );

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
        program_id: id(),
        accounts: vec![
            AccountMeta::new(chaos_request.pubkey(), false),
            AccountMeta::new(owner.pubkey(), true),
        ],
        data: instruction_data,
    };

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
    
    // Create chaos request account with proper size including Borsh overhead
    let rent = banks_client.get_rent().await.unwrap();
    let dummy_request = ChaosRequest {
        owner: Pubkey::new_unique(),
        amount: 0,
        status: 0,
        params: vec![], // Empty params for base size
        result_ref: String::new(),
    };
    let account_size = dummy_request.try_to_vec().unwrap().len();
    let account_rent = rent.minimum_balance(account_size);
    
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
