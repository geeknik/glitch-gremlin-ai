use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    declare_id,
};

use serde_json::Value;
use std::fs;

lazy_static::lazy_static! {
    static ref PROGRAM_IDS: Value = {
        let data = fs::read_to_string("../../config/program_ids.json")
            .expect("Failed to read program IDs config");
        serde_json::from_str(&data).expect("Failed to parse program IDs config")
    };
}

declare_id!(PROGRAM_IDS["glitch_gremlin"].as_str().unwrap());

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
