#![allow(unexpected_cfgs)]
//! # Glitch Gremlin Program
//! 
//! Core Solana program for managing chaos simulations and governance

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

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

// Program entrypoint
entrypoint!(process_instruction);

/// Main program entrypoint for processing instructions
/// 
/// # Arguments
/// * `_program_id` - Public key of the program account
/// * `_accounts` - Array of account information structures
/// * `_instruction_data` - Instruction data byte array
pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    // TODO: Implement program logic for governance instructions
    Ok(())
}

// Re-export key types for convenience
/// Program deployment utilities
pub use deploy::ProgramDeployer;
/// Helius RPC client
pub use rpc::helius_client::HeliusClient;
/// Governance state management
pub use state::governance_state::GovernanceState;
