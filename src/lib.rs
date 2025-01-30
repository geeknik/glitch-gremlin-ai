pub mod ai_assistant;
pub mod deploy;
pub mod rpc;
pub mod server;
pub mod state;

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

// Program entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    // TODO: Implement program logic for governance instructions
    Ok(())
}

// Re-export key types for convenience
pub use deploy::ProgramDeployer;
pub use rpc::helius_client::HeliusClient;
pub use state::governance_state::GovernanceState; 