use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    declare_id,
};

declare_id!("11111111111111111111111111111111");

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod governance;

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
mod test;
