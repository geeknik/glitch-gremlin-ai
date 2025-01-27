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

pub async fn program_test() -> (BanksClient, Keypair, Hash) {
    // Use actual program ID from DESIGN.md
    let program_id = id();
    // Dummy processor function with correct signature for ProgramTest
    #[allow(unused_variables)]
    fn dummy_processor<'a>(
        _vm: *mut solana_program_test::EbpfVm<'a, solana_program_test::InvokeContext<'static>>,
        _arg1: u64,
        _arg2: u64,
        _arg3: u64,
        _arg4: u64,
        _arg5: u64,
    ) -> () {
        // No return value needed
    }

    let program_test = ProgramTest::new(
        "glitch_gremlin",
        program_id,
        Some(dummy_processor as for<'a> fn(*mut solana_program_test::EbpfVm<'a, solana_program_test::InvokeContext<'static>>, u64, u64, u64, u64, u64) -> ()),
    );
    program_test.start().await
}
