use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
    instruction::{Instruction, AccountMeta},
    msg,
};
use borsh::{BorshDeserialize, BorshSerialize};
use crate::state;
use strum_macros::{Display, EnumString};

// Re-export state types for public use
pub use crate::state::{SecurityLevel, TestParams, ValidationMode};

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, Display, EnumString)]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum TestType {
    #[strum(serialize = "EXPLOIT")]
    Exploit,
    #[strum(serialize = "FUZZ")]
    Fuzz,
    #[strum(serialize = "LOAD")]
    Load,
    #[strum(serialize = "CONCURRENCY")]
    Concurrency,
    #[strum(serialize = "MUTATION")]
    Mutation,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct GlitchInstructionData {
    pub variant: u8,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub enum GlitchInstruction {
    /// Create a new governance proposal
    /// 
    /// Accounts expected:
    /// 0. `[writable]` The proposal account
    /// 1. `[signer]` The proposer
    /// 2. `[writable]` The staking account
    /// 3. `[]` The target program
    CreateProposal {
        id: u64,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
        test_params: TestParams,
    },

    /// Vote on a proposal
    /// 
    /// Accounts expected:
    /// 0. `[writable]` The proposal account
    /// 1. `[signer]` The voter
    Vote {
        proposal_id: u64,
        vote_for: bool,
        vote_amount: u64,
    },

    /// Execute an approved proposal
    /// 
    /// Accounts expected:
    /// 0. `[writable]` The proposal account
    /// 1. `[signer]` The executor
    ExecuteProposal {
        proposal_id: u64,
        multisig_signatures: Vec<[u8; 64]>,
        geographic_proofs: Vec<Vec<u8>>,
    },

    /// Submit test results
    /// 
    /// Accounts expected:
    /// 0. `[writable]` The chaos request account
    /// 1. `[signer]` The validator
    SubmitTestResults {
        request_id: u64,
        results: Vec<u8>,
        validator_signature: [u8; 64],
        geographic_proof: Vec<u8>,
    },

    /// Initialize a new chaos testing request
    /// 
    /// Accounts expected:
    /// 0. `[writable]` Chaos request account
    /// 1. `[signer]` Owner account
    /// 2. `[writable]` Escrow account
    /// 3. `[]` Target program
    /// 4. `[]` Token program
    InitializeRequest {
        amount: u64,
        test_params: TestParams,
        security_level: SecurityLevel,
        attestation_required: bool,
    },

    /// Update test parameters
    UpdateTestParams {
        new_params: TestParams,
    },

    /// Emergency halt execution
    EmergencyPause {
        reason: String,
    },

    /// Emergency resume execution
    EmergencyResume {
        reason: String,
    },

    /// Finalize a chaos request
    FinalizeChaosRequest {
        status: u8,
        validator_signatures: Vec<[u8; 64]>,
        geographic_proofs: Vec<Vec<u8>>,
        attestation_proof: Option<Vec<u8>>,
        sgx_quote: Option<Vec<u8>>,
        performance_metrics: Option<Vec<u8>>,
    },
}

impl GlitchInstruction {
    pub fn pack(&self) -> Vec<u8> {
        borsh::to_vec(self).unwrap()
    }

    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(input)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }

    pub fn create_instruction(
        program_id: &Pubkey,
        accounts: Vec<AccountMeta>,
        instruction: Self,
    ) -> Result<Instruction, ProgramError> {
        let data = borsh::to_vec(&instruction)
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        
        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    pub fn initialize_chaos_request(
        program_id: &Pubkey,
        request_owner: &Pubkey,
        chaos_request: &Pubkey,
        token_account: &Pubkey,
        escrow_account: &Pubkey,
        target_program: &Pubkey,
        amount: u64,
        test_params: TestParams,
        security_level: SecurityLevel,
        attestation_required: bool,
    ) -> Result<Instruction, ProgramError> {
        let instruction = Self::InitializeRequest {
            amount,
            test_params,
            security_level,
            attestation_required,
        };

        let accounts = vec![
            AccountMeta::new(*chaos_request, false),
            AccountMeta::new(*token_account, false),
            AccountMeta::new(*escrow_account, false),
            AccountMeta::new(*request_owner, true),
            AccountMeta::new_readonly(*target_program, false),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn create_proposal(
        program_id: &Pubkey,
        id: u64,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
        test_params: TestParams,
        accounts: Vec<AccountMeta>,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::CreateProposal {
            id,
            description,
            target_program,
            staked_amount,
            deadline,
            test_params,
        };
        
        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn vote(
        program_id: &Pubkey,
        proposal_id: u64,
        vote_for: bool,
        vote_amount: u64,
        voter: &Pubkey,
        proposal: &Pubkey,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::Vote {
            proposal_id,
            vote_for,
            vote_amount,
        };

        let accounts = vec![
            AccountMeta::new(*voter, true),
            AccountMeta::new(*proposal, false),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn execute_proposal(
        program_id: &Pubkey,
        proposal_id: u64,
        multisig_signatures: Vec<[u8; 64]>,
        geographic_proofs: Vec<Vec<u8>>,
        executor: &Pubkey,
        proposal: &Pubkey,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::ExecuteProposal {
            proposal_id,
            multisig_signatures,
            geographic_proofs,
        };

        let accounts = vec![
            AccountMeta::new(*executor, true),
            AccountMeta::new(*proposal, false),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn submit_test_results(
        program_id: &Pubkey,
        request_id: u64,
        results: Vec<u8>,
        validator_signature: [u8; 64],
        geographic_proof: Vec<u8>,
        validator: &Pubkey,
        request: &Pubkey,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::SubmitTestResults {
            request_id,
            results,
            validator_signature,
            geographic_proof,
        };

        let accounts = vec![
            AccountMeta::new(*validator, true),
            AccountMeta::new(*request, false),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn update_test_params(
        program_id: &Pubkey,
        new_params: TestParams,
        authority: &Pubkey,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::UpdateTestParams {
            new_params,
        };

        let accounts = vec![
            AccountMeta::new(*authority, true),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn emergency_pause(
        program_id: &Pubkey,
        reason: String,
        authority: &Pubkey,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::EmergencyPause {
            reason,
        };

        let accounts = vec![
            AccountMeta::new(*authority, true),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn emergency_resume(
        program_id: &Pubkey,
        reason: String,
        authority: &Pubkey,
    ) -> Result<Instruction, ProgramError> {
        let instruction = GlitchInstruction::EmergencyResume {
            reason,
        };

        let accounts = vec![
            AccountMeta::new(*authority, true),
        ];

        Self::create_instruction(program_id, accounts, instruction)
    }

    pub fn validate_security_requirements(
        security_level: SecurityLevel,
        test_params: &TestParams,
    ) -> Result<(), ProgramError> {
        // First validate hardware requirements
        security_level.validate_hardware_requirements()?;
        
        // Then validate test parameters against security level requirements
        security_level.validate_test_params(test_params)?;

        msg!("Security requirements validated successfully for {:?} level", security_level);
        Ok(())
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

// Add a custom validation trait for TestParams
pub trait TestParamsValidation {
    fn validate_and_convert(params: TestParams) -> Result<state::TestParams, ProgramError>;
}

impl TestParamsValidation for state::TestParams {
    fn validate_and_convert(params: TestParams) -> Result<Self, ProgramError> {
        // Enhanced validation with detailed error messages
        if params.min_coverage > 100 {
            msg!("Invalid coverage percentage: must be between 0-100");
            return Err(ProgramError::InvalidArgument);
        }
        if params.max_vulnerability_density == 0 {
            msg!("Invalid vulnerability density: must be greater than 0");
            return Err(ProgramError::InvalidArgument);
        }
        if params.min_validators == 0 {
            msg!("Invalid validator count: must be greater than 0");
            return Err(ProgramError::InvalidArgument);
        }
        if params.min_geographic_regions == 0 {
            msg!("Invalid geographic regions: must be greater than 0");
            return Err(ProgramError::InvalidArgument);
        }
        if params.test_duration == 0 {
            msg!("Invalid test duration: must be greater than 0");
            return Err(ProgramError::InvalidArgument);
        }
        if params.max_duration_seconds < params.test_duration {
            msg!("Invalid max duration: must be greater than test duration");
            return Err(ProgramError::InvalidArgument);
        }

        Ok(state::TestParams {
            security_level: params.security_level,
            test_duration: params.test_duration,
            min_coverage: params.min_coverage,
            max_vulnerability_density: params.max_vulnerability_density,
            max_duration_seconds: params.max_duration_seconds,
            min_validators: params.min_validators,
            min_stake_required: params.min_stake_required,
            min_geographic_regions: params.min_geographic_regions,
            attestation_required: params.attestation_required,
            memory_fence_required: params.memory_fence_required,
            entropy_checks: params.entropy_checks,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::program_test;
    use solana_sdk::signature::Keypair;
    use crate::id;
    
    #[test]
    fn test_serialize_initialize_chaos_request() {
        let instruction = GlitchInstruction::InitializeRequest {
            amount: 1000,
            test_params: TestParams::default(),
            security_level: SecurityLevel::High,
            attestation_required: true,
        };
        
        let serialized = instruction.try_to_vec().unwrap();
        let deserialized = GlitchInstruction::try_from_slice(&serialized).unwrap();
        
        match deserialized {
            GlitchInstruction::InitializeRequest { amount, test_params, security_level, attestation_required } => {
                assert_eq!(amount, 1000);
                assert_eq!(test_params, TestParams::default());
                assert_eq!(security_level, SecurityLevel::High);
                assert_eq!(attestation_required, true);
            }
            _ => panic!("Wrong instruction variant"),
        }
    }
    
    #[test]
    fn test_serialize_finalize_chaos_request() {
        let instruction = GlitchInstruction::FinalizeChaosRequest {
            status: 1,
            result_ref: b"test".to_vec(),
            attestation_proof: None,
            validator_signatures: vec![[0; 64]; 3],
            sgx_quote: None,
            performance_metrics: None,
        };
        
        let serialized = instruction.try_to_vec().unwrap();
        let deserialized = GlitchInstruction::try_from_slice(&serialized).unwrap();
        
        match deserialized {
            GlitchInstruction::FinalizeChaosRequest { status, result_ref, attestation_proof, validator_signatures, sgx_quote, performance_metrics } => {
                assert_eq!(status, 1);
                assert_eq!(result_ref, b"test");
                assert_eq!(attestation_proof, None);
                assert_eq!(validator_signatures, vec![[0; 64]; 3]);
                assert_eq!(sgx_quote, None);
                assert_eq!(performance_metrics, None);
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
            &crate::id(),
        );

        // Create proposal instruction
        let instruction_data = GlitchInstruction::CreateProposal {
            id: 1,
            description: "Test proposal".to_string(),
            target_program: Pubkey::new_unique(),
            staked_amount: 1000,
            deadline: 0,
            test_params: TestParams::default(),
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
