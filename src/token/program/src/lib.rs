use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    declare_id,
};

declare_id!("GlitchGremlinProgram11111111111111111111");

/// 7/10 multisig authority addresses from DESIGN.md 9.1
const MULTISIG_SIGNERS: [&str; 10] = [
    "F1rStS1gNer11111111111111111111111111111111",
    "SeCoNdS1gNer11111111111111111111111111111111",
    "Th1rDS1gNer11111111111111111111111111111111",
    "FoUrThS1gNer11111111111111111111111111111111",
    "F1fThS1gNer11111111111111111111111111111111",
    "S1xThS1gNer11111111111111111111111111111111",
    "Se7enS1gNer11111111111111111111111111111111",
    "E1ghtS1gNer11111111111111111111111111111111",
    "N1nThS1gNer11111111111111111111111111111111",
    "T3nThS1gNer11111111111111111111111111111111",
];

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod governance;
pub mod token_manager;
pub mod zk;

use crate::processor::Processor;

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    Processor::process(program_id, accounts, instruction_data)
}

#[cfg(test)]
mod tests;
