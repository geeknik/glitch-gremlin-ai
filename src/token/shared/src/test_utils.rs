use solana_program_test::*;
use solana_sdk::{
    pubkey::Pubkey,
    hash::Hash,
    signer::keypair::Keypair,
};
use glitch_gremlin::process_instruction;

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
