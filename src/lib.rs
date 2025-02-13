#![allow(unexpected_cfgs)]
//! # Glitch Gremlin Program
//! 
//! Core Solana program for managing chaos simulations and governance

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    msg,
};

/// Artificial Intelligence assistant module
pub mod ai_assistant;
/// Program deployment utilities
pub mod deploy;
/// RPC client implementations
pub mod rpc;
/// Server and API functionality
pub mod server;
/// Program state management
pub mod state;

// Program entrypoint
entrypoint!(process_instruction);

/// Chaos request status
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum ChaosRequestStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

/// Chaos request parameters
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ChaosRequest {
    /// Unique request identifier
    pub request_id: u64,
    /// Public key of the requestor
    pub requestor: Pubkey,
    /// Amount of tokens escrowed
    pub tokens_escrowed: u64,
    /// Type of chaos test requested
    pub chaos_type: String,
    /// Current status
    pub status: ChaosRequestStatus,
    /// Optional result reference (IPFS/Arweave hash)
    pub result_reference: Option<String>,
}

/// Program instructions
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum GlitchGremlinInstruction {
    /// Initialize a new chaos request
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The request creator
    /// 1. `[writable]` The chaos request account to initialize
    /// 2. `[writable]` Token account to transfer from
    /// 3. `[]` Token program
    InitializeChaosRequest {
        request_id: u64,
        chaos_type: String,
        tokens_to_escrow: u64,
    },

    /// Update request status
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The AI engine authority
    /// 1. `[writable]` The chaos request account to update
    UpdateRequestStatus {
        status: ChaosRequestStatus,
        result_reference: Option<String>,
    },
}

/// Main program entrypoint for processing instructions
/// 
/// # Arguments
/// * `program_id` - Public key of the program account
/// * `accounts` - Array of account information structures
/// * `instruction_data` - Instruction data byte array
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = GlitchGremlinInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        GlitchGremlinInstruction::InitializeChaosRequest { request_id, chaos_type, tokens_to_escrow } => {
            msg!("Instruction: InitializeChaosRequest");
            // TODO: Implement request initialization
            Ok(())
        }
        GlitchGremlinInstruction::UpdateRequestStatus { status, result_reference } => {
            msg!("Instruction: UpdateRequestStatus");
            // TODO: Implement status update
            Ok(())
        }
    }
}

// Re-export key types for convenience
/// Program deployment utilities
pub use deploy::ProgramDeployer;
/// Helius RPC client
pub use rpc::helius_client::HeliusClient;
/// Governance state management
pub use state::governance_state::GovernanceState;
