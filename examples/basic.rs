use glitch_sdk::GlitchClient;
use solana_sdk::signature::Keypair;
use std::str::FromStr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = GlitchClient::new("https://api.mainnet-beta.solana.com".to_string(), None);
    let signer = Keypair::new();

    // Create a chaos request
    client.create_chaos_request(&signer, 1000, b"test_params".to_vec()).await?;
    println!("Chaos request created");

    // Finalize the request
    let request_id = Pubkey::from_str("GremLin1111111111111111111111111111111111111")?;
    client.finalize_chaos_request(&signer, request_id, 1, b"test_results".to_vec()).await?;
    println!("Chaos request finalized");

    Ok(())
}
