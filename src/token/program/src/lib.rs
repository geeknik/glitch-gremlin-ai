//! Glitch Gremlin Program - On-chain program for chaos engineering and security testing
//! 
//! This program implements the core functionality for the Glitch Gremlin protocol,
//! providing controlled chaos testing capabilities for Solana programs as described
//! in the DESIGN.md specification.

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    declare_id,
    program_error::ProgramError,
    msg,
};
use ed25519_dalek::{Signature, PublicKey};
use borsh::BorshDeserialize;
use crate::{
    instruction::GlitchInstruction,
    processor::Processor,
    error::GlitchError,
    state::RateLimitInfo,
};

declare_id!("GGremN5xG5gx3VQ8CqpVX1EdfxQt5u4ij1fF8GGR8zf");

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

/// Error types and handling
pub mod error;
/// Instruction definitions and processing
pub mod instruction;
/// Main program processor
pub mod processor;
/// Program state management
pub mod state;
/// Token management functionality
pub mod token_manager;
/// Database interactions
pub mod database;
/// Governance functionality
pub mod governance;
/// Zero-knowledge proof utilities
pub mod zk;
/// Security validation and checks
pub mod security;
/// Result reporting and metrics
pub mod reporting;
/// Input validation utilities
pub mod validation;
/// Attestation and verification
pub mod attestation;
/// AI Assistant module for managing intelligent chaos testing
pub mod ai_assistant;
/// Deployment management for chaos testing targets
pub mod deploy;
/// RPC client implementations for blockchain interaction
pub mod rpc;
/// Server implementation for handling chaos test requests
pub mod server;

// Security constants from DESIGN.md 9.1
pub const MIN_VALIDATOR_COUNT: usize = 3;
pub const MIN_GEOGRAPHIC_REGIONS: usize = 3;
pub const ATTESTATION_TIMEOUT_SECS: i64 = 300; // 5 minutes
pub const MAX_COMPUTE_UNITS: u32 = 200_000;
pub const MIN_ENTROPY_SCORE: f64 = 0.75;

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint implementation
/// Process an incoming instruction
///
/// This is the main entry point for the program. It deserializes the instruction data
/// and routes to the appropriate instruction processor.
///
/// # Arguments
/// * `program_id` - The program ID of the Glitch Gremlin program
/// * `accounts` - The accounts required for the instruction
/// * `instruction_data` - The serialized instruction data
///
/// # Returns
/// * `ProgramResult` - The result of processing the instruction
pub fn process_instruction<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Glitch program entrypoint");

    if instruction_data.is_empty() {
        msg!("Error: Empty instruction data");
        return Err(GlitchError::InvalidInstruction.into());
    }

    let instruction = GlitchInstruction::unpack(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        GlitchInstruction::CreateProposal {
            id,
            description,
            target_program,
            staked_amount,
            deadline,
            test_params,
        } => {
            msg!("Processing create proposal");
            Processor::process_create_proposal(
                program_id,
                accounts,
                id,
                description,
                target_program,
                staked_amount,
                deadline,
                &RateLimitInfo::default(),
                test_params.into(),
            )
        }
        GlitchInstruction::Vote {
            proposal_id,
            vote_for,
            vote_amount,
        } => {
            msg!("Instruction: Vote");
            Processor::process_vote(
                program_id,
                accounts,
                proposal_id,
                vote_for,
                vote_amount,
            )
        }
        GlitchInstruction::ExecuteProposal {
            proposal_id,
            multisig_signatures,
            geographic_proofs,
        } => {
            msg!("Instruction: Execute Proposal");
            Processor::process_execute_proposal(
                program_id,
                accounts,
                proposal_id,
                multisig_signatures,
                geographic_proofs,
            )
        }
        GlitchInstruction::SubmitTestResults {
            request_id,
            results,
            validator_signature,
            geographic_proof,
        } => {
            msg!("Instruction: Submit Test Results");
            Processor::process_submit_test_results(
                program_id,
                accounts,
                request_id,
                results,
                validator_signature,
                geographic_proof,
            )
        }
        GlitchInstruction::UpdateTestParams { new_params } => {
            msg!("Processing update test params");
            Processor::process_update_test_params(program_id, accounts, new_params.into())
        }
        GlitchInstruction::EmergencyPause { reason } => {
            Processor::process_emergency_pause(program_id, accounts, reason)
        }
        GlitchInstruction::EmergencyResume { reason } => {
            Processor::process_emergency_resume(program_id, accounts, reason)
        }
        GlitchInstruction::InitializeRequest {
            amount,
            test_params,
            security_level,
            attestation_required: _,
        } => {
            msg!("Processing initialize request");
            Processor::process_initialize_request(program_id, accounts, amount, test_params.into(), security_level)
        }
        GlitchInstruction::FinalizeChaosRequest {
            status,
            validator_signatures,
            geographic_proofs,
            attestation_proof,
            sgx_quote,
            performance_metrics,
        } => {
            Processor::process_finalize_request(
                program_id,
                accounts,
                status,
                validator_signatures,
                geographic_proofs,
                attestation_proof,
                sgx_quote,
                performance_metrics,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Epoch;
    use solana_sdk::{signature::Signer, signer::keypair::Keypair};

    #[test]
    fn test_program_initialization() {
        // ALICE and BOB test accounts from DESIGN.md 9.1
        let program_id = id();
        let alice = Keypair::new();
        let bob = Keypair::new();
        
        let mut accounts = vec![
            AccountInfo::new(&alice.pubkey(), true, false, &mut 0, &mut [], &program_id, false, Epoch::default()),
            AccountInfo::new(&bob.pubkey(), true, false, &mut 0, &mut [], &program_id, false, Epoch::default())
        ];

        // DESIGN.md 9.1 - Geographic diversity enforcement
        let mut regions = std::collections::HashSet::new();
        for signer in &MULTISIG_SIGNERS {
            // First byte of signature as region code (0-4 for 5 regions)
            regions.insert(signer.as_bytes()[0] % 5);
        }
        // DESIGN.md 9.1 - Require 3+ regions from 7+ signers
        if regions.len() < 3 || MULTISIG_SIGNERS.len() < 7 {
            return Err(GlitchError::InsufficientDiversity.into());
        }

        assert!(Processor::validate_initialized(&program_id, &accounts).is_err());
    }

    #[test]
    fn test_security_level_validation() {
        let mut params = TestParams {
            security_level: 5, // Invalid level
            ..TestParams::default()
        };
        
        assert_eq!(
            Processor::validate_security_level(&params),
            Err(GlitchError::InvalidSecurityLevel.into())
        );
    }

    #[test]
    fn test_multisig_verification() {
        // Test with ALICE and BOB from DESIGN.md 9.1
        let signers = vec![
            ALICE, ALICE, ALICE, ALICE, ALICE, ALICE, // 6x ALICE
            BOB, BOB, BOB, BOB // 4x BOB
        ];
        
        // Should fail geographic diversity check (only 2 regions)
        assert!(Processor::validate_multisig(&signers).is_err());
        
        // Valid 7/10 from 3+ regions (mocking region codes)
        let valid_signers = vec![
            Pubkey::new_from_array([0; 32]), // Region 0
            Pubkey::new_from_array([1; 32]), // Region 1
            Pubkey::new_from_array([2; 32]), // Region 2
            Pubkey::new_from_array([0; 32]),
            Pubkey::new_from_array([1; 32]),
            Pubkey::new_from_array([2; 32]),
            Pubkey::new_from_array([0; 32])
        ];
        assert!(Processor::validate_multisig(&valid_signers).is_ok());
    }

    #[test]
    fn test_entropy_validation() {
        let mut data = vec![0u8; 32];
        data[0..4].copy_from_slice(&[0x53, 0x47, 0x58, 0x21]); // Valid SGX prefix
        
        let account = AccountInfo::new(
            &Pubkey::new_unique(),
            false,
            false,
            &mut 0,
            &mut data[..],
            &Pubkey::new_unique(),
            false,
            Epoch::default()
        );
        
        assert!(Processor::validate_entropy(&account).is_ok());
    }

    #[test]
    fn test_process_instruction() {
        // TODO: Add comprehensive tests
    }
}
