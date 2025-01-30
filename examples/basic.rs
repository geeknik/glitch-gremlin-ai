use solana_sdk::{
    signature::{Keypair, Signer},
    pubkey::Pubkey,
};
use std::str::FromStr;
use glitch_gremlin_ai::{
    ProgramDeployer,
    HeliusClient,
    GovernanceState,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize a new keypair for testing
    let signer = Keypair::new();
    
    // Create a new program deployer
    let _deployer = ProgramDeployer::new(signer.pubkey());
    
    // Initialize Helius client for RPC access
    let _client = HeliusClient::new(
        "https://api.helius.xyz".to_string(),
        "your-api-key-here".to_string()
    );
    
    // Create a new governance state
    let state = GovernanceState::new(signer.pubkey());

    // Example of working with a specific program ID
    let program_id = Pubkey::from_str("GremLin1111111111111111111111111111111111111")?;
    println!("Program ID: {}", program_id);

    // Print the authority
    println!("Authority: {}", state.authority);

    Ok(())
}
