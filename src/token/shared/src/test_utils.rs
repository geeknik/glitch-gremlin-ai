use std::str::FromStr;
use solana_program_test::*;
use solana_sdk::{
    hash::Hash,
    pubkey::Pubkey, 
    signature::Keypair,
};

// Program ID for tests (matches DESIGN.md 9.1 deployment address)
pub fn id() -> Pubkey {
    Pubkey::from_str("GGremN5xG5gx3VQ8CqpVX1EdfxQt5u4ij1fF8GGR8zf").unwrap()
}

// Test account constants from DESIGN.md 9.1
pub const ALICE: Pubkey = Pubkey::new_from_array([1; 32]);
pub const BOB: Pubkey = Pubkey::new_from_array([2; 32]);

pub struct TestContext {
    pub banks_client: BanksClient,
    pub payer: Keypair,
    pub last_blockhash: Hash,
}

impl TestContext {
    pub async fn new() -> Self {
        let program_id = id();
        let mut program_test = ProgramTest::new(
            "glitch_gremlin",
            program_id,
            processor!(process_instruction),
        );

        // Add required programs
        program_test.add_program("spl_token", spl_token::id(), None);
        
        let (banks_client, payer, last_blockhash) = program_test.start().await;
        
        Self {
            banks_client,
            payer,
            last_blockhash,
        }
    }

    pub async fn get_account_data<T: borsh::BorshDeserialize>(
        &mut self,
        address: &Pubkey
    ) -> Option<T> {
        self.banks_client
            .get_account(*address)
            .await
            .unwrap()
            .map(|account| T::try_from_slice(&account.data).unwrap())
    }
}

pub async fn program_test() -> (BanksClient, Keypair, Hash) {
    let ctx = TestContext::new().await;
    (ctx.banks_client, ctx.payer, ctx.last_blockhash)
}
