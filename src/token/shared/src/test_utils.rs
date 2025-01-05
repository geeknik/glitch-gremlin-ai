use {
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
