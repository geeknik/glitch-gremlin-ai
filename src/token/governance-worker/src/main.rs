use solana_client::rpc_client::RpcClient;
use solana_program::pubkey::Pubkey;
use std::str::FromStr;
use std::error::Error;
use tokio::time::{sleep, Duration};

mod processor;
mod state;
mod error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    println!("Starting Glitch Gremlin Governance Worker...");

    let rpc_url = std::env::var("SOLANA_RPC_URL")
        .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
    
    let client = RpcClient::new(rpc_url);

    // Program ID from environment or default to devnet
    let program_id = std::env::var("GLITCH_PROGRAM_ID")
        .map(|id| Pubkey::from_str(&id).expect("Invalid program ID"))
        .unwrap_or_else(|_| Pubkey::new_unique());

    println!("Connected to Solana cluster");
    println!("Program ID: {}", program_id);

    // Main worker loop
    loop {
        if let Err(e) = processor::process_governance_queue(&client, &program_id).await {
            eprintln!("Error processing governance queue: {}", e);
        }

        // Sleep before next iteration
        sleep(Duration::from_secs(5)).await;
    }
}
