use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::program_error::ProgramError;
use std::convert::TryInto;
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
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
        result_ref: Vec<u8>, // Changed from String to Vec<u8> for better Borsh compatibility
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
                
                let result_ref = rest[1..].to_vec();

                Self::FinalizeChaosRequest {
                    status: *status,
                    result_ref,
                }
            }
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum GovernanceInstruction {
    /// Create a new governance proposal
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The proposal account
    /// 2. `[writable]` The staking account
    /// 3. `[signer]` The proposer
    CreateProposal {
        id: u64,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
    },

    /// Vote on a governance proposal
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The proposal account
    /// 2. `[writable]` The voter's staking account
    /// 3. `[signer]` The voter
    Vote {
        proposal_id: u64,
        vote_for: bool,
        vote_amount: u64,
    },

    /// Execute an approved proposal
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The proposal account
    /// 2. `[signer]` The executor
    ExecuteProposal {
        proposal_id: u64,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_serialize_initialize_chaos_request() {
        let instruction = GlitchInstruction::InitializeChaosRequest {
            amount: 1000,
            params: vec![1, 2, 3],
        };
        
        let serialized = instruction.try_to_vec().unwrap();
        let deserialized = GlitchInstruction::try_from_slice(&serialized).unwrap();
        
        match deserialized {
            GlitchInstruction::InitializeChaosRequest { amount, params } => {
                assert_eq!(amount, 1000);
                assert_eq!(params, vec![1, 2, 3]);
            }
            _ => panic!("Wrong instruction variant"),
        }
    }
    
    #[test]
    fn test_serialize_finalize_chaos_request() {
        let instruction = GlitchInstruction::FinalizeChaosRequest {
            status: 1,
            result_ref: b"test".to_vec(),
        };
        
        let serialized = instruction.try_to_vec().unwrap();
        let deserialized = GlitchInstruction::try_from_slice(&serialized).unwrap();
        
        match deserialized {
            GlitchInstruction::FinalizeChaosRequest { status, result_ref } => {
                assert_eq!(status, 1);
                assert_eq!(result_ref, b"test");
            }
            _ => panic!("Wrong instruction variant"),
        }
    }
}
