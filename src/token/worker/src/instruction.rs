use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum GlitchInstruction {
    FinalizeChaosRequest {
        status: u8,
        result_ref: Vec<u8>,
    }
}
