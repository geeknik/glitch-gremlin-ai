use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
};
use solana_program_test::*;
use solana_sdk::{
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};
use crate::{
    state::{ChaosRequest, SecurityLevel, TestParams},
    processor::Processor,
};

pub struct TestContext {
    pub banks_client: BanksClient,
    pub payer: Keypair,
    pub recent_blockhash: Hash,
}

impl TestContext {
    pub async fn new() -> Self {
        let program_id = Pubkey::new_unique();
        let (banks_client, payer, recent_blockhash) = ProgramTest::new(
            "glitch_gremlin",
            program_id,
            processor!(Processor::process_instruction),
        )
        .start()
        .await;

        Self {
            banks_client,
            payer,
            recent_blockhash,
        }
    }

    pub async fn create_test_accounts(&mut self) -> (Keypair, Keypair, Keypair) {
        let chaos_request = Keypair::new();
        let escrow = Keypair::new();
        let owner = Keypair::new();

        // Create accounts with required space
        self.create_account(&chaos_request, 1000).await.unwrap();
        self.create_account(&escrow, 1000).await.unwrap();
        self.create_account(&owner, 1000).await.unwrap();

        (chaos_request, escrow, owner)
    }

    async fn create_account(&self, account: &Keypair, space: u64) -> Result<(), ProgramError> {
        let rent = Rent::default();
        let lamports = rent.minimum_balance(space as usize);

        let ix = system_instruction::create_account(
            &self.payer.pubkey(),
            &account.pubkey(),
            lamports,
            space,
            &crate::id(),
        );

        let transaction = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.payer.pubkey()),
            &[&self.payer, account],
            self.recent_blockhash,
        );

        self.banks_client
            .process_transaction(transaction)
            .await
            .map_err(|_| ProgramError::Custom(1))?;

        Ok(())
    }
} 