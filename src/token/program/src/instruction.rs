use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::program_error::ProgramError;
use std::convert::TryInto;

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub enum GlitchInstruction {
    /// Initialize a new chaos request
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The chaos request account
    /// 2. `[writable]` The token account to debit
    /// 3. `[signer]` The request owner
    InitializeChaosRequest {
        /// Amount of tokens to lock
        amount: u64,
        /// Parameters for the chaos test
        params: Vec<u8>,
    },

    /// Finalize a chaos request
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The chaos request account
    /// 2. `[signer]` The authorized finalizer
    FinalizeChaosRequest {
        /// Result status code
        status: u8,
        /// Reference to results (e.g. IPFS hash)
        result_ref: String,
    },
}

impl GlitchInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;

        Ok(match tag {
            0 => {
                let amount = rest
                    .get(..8)
                    .and_then(|slice| slice.try_into().ok())
                    .map(u64::from_le_bytes)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                
                let params = rest[8..].to_vec();
                
                Self::InitializeChaosRequest {
                    amount,
                    params,
                }
            }
            1 => {
                let status = rest
                    .get(0)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                
                let result_ref = String::from_utf8(rest[1..].to_vec())
                    .map_err(|_| ProgramError::InvalidInstructionData)?;

                Self::FinalizeChaosRequest {
                    status: *status,
                    result_ref,
                }
            }
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}
