use borsh::{BorshDeserialize, BorshSerialize};
use std::convert::TryInto;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum GlitchInstruction {
    FinalizeChaosRequest {
        status: u8,
        result_ref: Vec<u8>,
    }
}
