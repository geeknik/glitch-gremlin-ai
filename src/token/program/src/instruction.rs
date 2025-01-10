use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
    instruction::{Instruction, AccountMeta},
    system_instruction,
};
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use crate::governance::GovernanceProposal;
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum GlitchInstruction {
    /// Initialize a new chaos request
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The chaos request account
    /// 2. `[writable]` The token account to debit
    /// 3. `[signer]` The request owner
    /// 4. `[]` The rate limit account
    InitializeChaosRequest {
        /// Amount of tokens to lock
        amount: u64,
        /// Parameters for the chaos test
        params: Vec<u8>,
        /// Rate limit configuration
        rate_limit: RateLimitConfig,
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

    /// Create a governance proposal
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The proposal account
    /// 2. `[writable]` The staking account
    /// 3. `[signer]` The proposer
    CreateProposal {
        /// Unique proposal ID
        id: u64,
        /// Description of the proposal
        description: String,
        /// Target program to test
        target_program: Pubkey,
        /// Amount of tokens staked
        staked_amount: u64,
        /// Voting deadline (Unix timestamp)
        deadline: i64,
    },

    /// Vote on a governance proposal
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The proposal account
    /// 2. `[writable]` The voter's staking account
    /// 3. `[signer]` The voter
    Vote {
        /// Proposal ID to vote on
        proposal_id: u64,
        /// Whether voting for or against
        vote_for: bool,
        /// Amount of tokens to vote with
        vote_amount: u64,
    },

    /// Execute an approved proposal
    /// 
    /// Accounts expected:
    /// 1. `[writable]` The proposal account
    /// 2. `[signer]` The executor
    ExecuteProposal {
        /// Proposal ID to execute
        proposal_id: u64,
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

/// Governance instructions
impl GlitchInstruction {
    pub fn create_proposal(
        id: u64,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
    ) -> Self {
        Self::CreateProposal {
            id,
            description,
            target_program,
            staked_amount,
            deadline,
        }
    }

    pub fn vote(
        proposal_id: u64,
        vote_for: bool,
        vote_amount: u64,
    ) -> Self {
        Self::Vote {
            proposal_id,
            vote_for,
            vote_amount,
        }
    }

    pub fn execute_proposal(
        proposal_id: u64,
    ) -> Self {
        Self::ExecuteProposal {
            proposal_id,
        }
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
    use crate::test::{program_test, id};
    
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

    #[tokio::test]
    async fn test_create_proposal() {
        let (mut banks_client, payer, recent_blockhash) = program_test().await;
        let proposer = Keypair::new();
        let proposal = Keypair::new();
        let staking_account = Keypair::new();
        
        // Create accounts
        let rent = banks_client.get_rent().await.unwrap();
        let account_size = std::mem::size_of::<GovernanceProposal>();
        let account_rent = rent.minimum_balance(account_size);
        
        let create_account_ix = system_instruction::create_account(
            &payer.pubkey(),
            &proposal.pubkey(),
            account_rent,
            account_size as u64,
            &id(),
        );

        // Create proposal instruction
        let instruction_data = GlitchInstruction::CreateProposal {
            id: 1,
            description: "Test proposal".to_string(),
            target_program: Pubkey::new_unique(),
            staked_amount: 1000,
            deadline: 1234567890,
        }
        .try_to_vec()
        .unwrap();

        let create_proposal_ix = Instruction {
            program_id: id(),
            accounts: vec![
                AccountMeta::new(proposal.pubkey(), false),
                AccountMeta::new(staking_account.pubkey(), false),
                AccountMeta::new(proposer.pubkey(), true),
            ],
            data: instruction_data,
        };

        let transaction = Transaction::new_signed_with_payer(
            &[create_account_ix, create_proposal_ix],
            Some(&payer.pubkey()),
            &[&payer, &proposal, &staking_account, &proposer],
            recent_blockhash,
        );

        banks_client.process_transaction(transaction).await.unwrap();

        // Verify proposal state
        let account = banks_client
            .get_account(proposal.pubkey())
            .await
            .unwrap()
            .unwrap();
        
        let proposal = GovernanceProposal::try_from_slice(&account.data).unwrap();
        assert_eq!(proposal.id, 1);
        assert_eq!(proposal.description, "Test proposal");
        assert_eq!(proposal.staked_amount, 1000);
    }
}
