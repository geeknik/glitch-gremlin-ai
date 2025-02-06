#[cfg(test)]
mod tests {
    use super::*;
    use solana_program_test::*;
    use solana_sdk::{signature::Keypair, signer::Signer};

    #[tokio::test]
    async fn test_token_distribution() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        // Create test accounts
        let authority = Keypair::new();
        let recipient = Keypair::new();
        let mint = Keypair::new();

        // Initialize test context
        let mut context = program_test.start_with_context().await;
        
        // Initialize token
        let result = initialize_token_test(&mut context, &authority, &mint).await;
        assert!(result.is_ok());

        // Test direct distribution
        let amount = 1000;
        let result = distribute_tokens_test(
            &mut context,
            &authority,
            &recipient,
            amount,
            None,
        ).await;
        assert!(result.is_ok());

        // Verify recipient balance
        let recipient_balance = get_token_balance(&mut context, &recipient.pubkey()).await;
        assert_eq!(recipient_balance, amount);
    }

    #[tokio::test]
    async fn test_vesting_schedule() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        // Create test accounts
        let authority = Keypair::new();
        let beneficiary = Keypair::new();
        let mint = Keypair::new();

        // Initialize test context
        let mut context = program_test.start_with_context().await;
        
        // Initialize token
        let result = initialize_token_test(&mut context, &authority, &mint).await;
        assert!(result.is_ok());

        // Create vesting schedule
        let schedule = VestingSchedule {
            duration: 365 * 24 * 60 * 60, // 1 year
            cliff_duration: 90 * 24 * 60 * 60, // 90 days
            period: 30 * 24 * 60 * 60, // 30 days
        };

        // Test vested distribution
        let amount = 1000;
        let result = distribute_tokens_test(
            &mut context,
            &authority,
            &beneficiary,
            amount,
            Some(schedule),
        ).await;
        assert!(result.is_ok());

        // Test before cliff
        context.warp_to_slot(89 * 24 * 60 * 60).unwrap(); // 89 days
        let result = release_vested_tokens_test(&mut context, &beneficiary).await;
        assert!(result.is_err());

        // Test after cliff
        context.warp_to_slot(91 * 24 * 60 * 60).unwrap(); // 91 days
        let result = release_vested_tokens_test(&mut context, &beneficiary).await;
        assert!(result.is_ok());

        // Verify partial vesting
        let beneficiary_balance = get_token_balance(&mut context, &beneficiary.pubkey()).await;
        assert!(beneficiary_balance > 0 && beneficiary_balance < amount);

        // Test full vesting
        context.warp_to_slot(366 * 24 * 60 * 60).unwrap(); // 366 days
        let result = release_vested_tokens_test(&mut context, &beneficiary).await;
        assert!(result.is_ok());

        // Verify full amount received
        let beneficiary_balance = get_token_balance(&mut context, &beneficiary.pubkey()).await;
        assert_eq!(beneficiary_balance, amount);
    }

    #[tokio::test]
    async fn test_fee_collection() {
        let program_id = Pubkey::new_unique();
        let mut program_test = ProgramTest::new(
            "governance",
            program_id,
            processor!(process_instruction),
        );

        // Create test accounts
        let authority = Keypair::new();
        let payer = Keypair::new();
        let mint = Keypair::new();

        // Initialize test context
        let mut context = program_test.start_with_context().await;
        
        // Initialize token and governance
        let result = initialize_token_test(&mut context, &authority, &mint).await;
        assert!(result.is_ok());
        
        let result = initialize_governance_test(&mut context, &authority).await;
        assert!(result.is_ok());

        // Test fee collection
        let test_params = ChaosParams {
            complexity: ChaosComplexity::Medium,
            duration: 3600, // 1 hour
            ..Default::default()
        };

        let initial_treasury = get_treasury_balance(&mut context).await;
        
        let result = collect_chaos_fee_test(
            &mut context,
            &payer,
            test_params,
        ).await;
        assert!(result.is_ok());

        // Verify treasury balance increased
        let final_treasury = get_treasury_balance(&mut context).await;
        assert!(final_treasury > initial_treasury);

        // Test rate limiting
        for _ in 0..10 {
            let result = collect_chaos_fee_test(
                &mut context,
                &payer,
                test_params,
            ).await;
            if result.is_err() {
                // Rate limit hit
                return;
            }
        }
        panic!("Rate limiting failed");
    }

    // Helper functions
    async fn initialize_token_test(
        context: &mut ProgramTestContext,
        authority: &Keypair,
        mint: &Keypair,
    ) -> Result<()> {
        let rent = context.banks_client.get_rent().await.unwrap();
        let mint_rent = rent.minimum_balance(spl_token::state::Mint::LEN);

        // Create mint account
        let instruction = system_instruction::create_account(
            &context.payer.pubkey(),
            &mint.pubkey(),
            mint_rent,
            spl_token::state::Mint::LEN as u64,
            &spl_token::id(),
        );

        let transaction = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&context.payer.pubkey()),
            &[&context.payer, mint],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(transaction).await?;

        // Initialize mint
        let ix = initialize_token(
            &governance::id(),
            &mint.pubkey(),
            &authority.pubkey(),
        );

        let transaction = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&context.payer, authority],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(transaction).await?;

        Ok(())
    }

    async fn distribute_tokens_test(
        context: &mut ProgramTestContext,
        authority: &Keypair,
        recipient: &Keypair,
        amount: u64,
        schedule: Option<VestingSchedule>,
    ) -> Result<()> {
        // Create recipient token account if needed
        let recipient_token_account = Keypair::new();
        let rent = context.banks_client.get_rent().await.unwrap();
        let account_rent = rent.minimum_balance(spl_token::state::Account::LEN);

        let create_account_ix = system_instruction::create_account(
            &context.payer.pubkey(),
            &recipient_token_account.pubkey(),
            account_rent,
            spl_token::state::Account::LEN as u64,
            &spl_token::id(),
        );

        let init_account_ix = spl_token::instruction::initialize_account(
            &spl_token::id(),
            &recipient_token_account.pubkey(),
            &governance::GREMLINAI_TOKEN_MINT,
            &recipient.pubkey(),
        )?;

        let distribute_ix = distribute_tokens(
            &governance::id(),
            &authority.pubkey(),
            &recipient.pubkey(),
            &recipient_token_account.pubkey(),
            amount,
            schedule,
        );

        let transaction = Transaction::new_signed_with_payer(
            &[create_account_ix, init_account_ix, distribute_ix],
            Some(&context.payer.pubkey()),
            &[&context.payer, &recipient_token_account, authority, recipient],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(transaction).await?;

        Ok(())
    }

    async fn release_vested_tokens_test(
        context: &mut ProgramTestContext,
        beneficiary: &Keypair,
    ) -> Result<()> {
        let (vesting_account, _) = Pubkey::find_program_address(
            &[b"vesting", beneficiary.pubkey().as_ref()],
            &governance::id(),
        );

        let release_ix = release_vested_tokens(
            &governance::id(),
            &vesting_account,
            &beneficiary.pubkey(),
        );

        let transaction = Transaction::new_signed_with_payer(
            &[release_ix],
            Some(&context.payer.pubkey()),
            &[&context.payer, beneficiary],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(transaction).await?;

        Ok(())
    }

    async fn collect_chaos_fee_test(
        context: &mut ProgramTestContext,
        payer: &Keypair,
        params: ChaosParams,
    ) -> Result<()> {
        let (treasury, treasury_bump) = Pubkey::find_program_address(
            &[b"treasury"],
            &governance::id(),
        );

        let payer_token_account = get_associated_token_address(
            &payer.pubkey(),
            &governance::GREMLINAI_TOKEN_MINT,
        );

        let treasury_token_account = get_associated_token_address(
            &treasury,
            &governance::GREMLINAI_TOKEN_MINT,
        );

        let collect_fee_ix = collect_chaos_fee(
            &governance::id(),
            &payer.pubkey(),
            &payer_token_account,
            &treasury_token_account,
            params,
        );

        let transaction = Transaction::new_signed_with_payer(
            &[collect_fee_ix],
            Some(&context.payer.pubkey()),
            &[&context.payer, payer],
            context.last_blockhash,
        );

        context.banks_client.process_transaction(transaction).await?;

        Ok(())
    }

    async fn get_token_balance(
        context: &mut ProgramTestContext,
        owner: &Pubkey,
    ) -> u64 {
        let token_account = get_associated_token_address(
            owner,
            &governance::GREMLINAI_TOKEN_MINT,
        );

        let account = context.banks_client
            .get_account(token_account)
            .await
            .unwrap()
            .unwrap();

        let token_account = spl_token::state::Account::unpack(&account.data).unwrap();
        token_account.amount
    }

    async fn get_treasury_balance(
        context: &mut ProgramTestContext,
    ) -> u64 {
        let (treasury, _) = Pubkey::find_program_address(
            &[b"treasury"],
            &governance::id(),
        );

        let treasury_token_account = get_associated_token_address(
            &treasury,
            &governance::GREMLINAI_TOKEN_MINT,
        );

        let account = context.banks_client
            .get_account(treasury_token_account)
            .await
            .unwrap()
            .unwrap();

        let token_account = spl_token::state::Account::unpack(&account.data).unwrap();
        token_account.amount
    }
} 