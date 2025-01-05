use clap::{Parser, Subcommand};
use solana_sdk::signature::Keypair;
use glitch_sdk::GlitchClient;
use std::str::FromStr;

#[derive(Parser)]
#[clap(name = "glitch", version = "0.1.0", about = "Glitch Gremlin CLI")]
struct Cli {
    #[clap(subcommand)]
    command: Commands,
    
    #[clap(long, default_value = "https://api.mainnet-beta.solana.com")]
    rpc_url: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new chaos request
    Create {
        #[clap(long)]
        amount: u64,
        #[clap(long)]
        params: String,
    },
    /// Finalize a chaos request
    Finalize {
        #[clap(long)]
        request_id: String,
        #[clap(long)]
        status: u8,
        #[clap(long)]
        result_ref: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let client = GlitchClient::new(cli.rpc_url, None);
    let signer = Keypair::new(); // In real usage, load from keypair file

    match cli.command {
        Commands::Create { amount, params } => {
            client.create_chaos_request(&signer, amount, params.into_bytes()).await?;
            println!("Chaos request created successfully");
        }
        Commands::Finalize { request_id, status, result_ref } => {
            let request_pubkey = Pubkey::from_str(&request_id)?;
            client.finalize_chaos_request(&signer, request_pubkey, status, result_ref.into_bytes()).await?;
            println!("Chaos request finalized successfully");
        }
    }

    Ok(())
}
