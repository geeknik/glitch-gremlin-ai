use redis::Commands;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::{thread, time::Duration};
use crate::job_processor::process_chaos_job;

mod job_processor;
mod chaos_engine;

const REDIS_URL: &str = "redis://r.glitchgremlin.ai/";
const RPC_URL: &str = "https://api.mainnet-beta.solana.com";
const PROGRAM_ID: &str = "GremLin1111111111111111111111111111111111111";

#[tokio::main]
async fn main() {
    // Initialize Redis connection
    let client = redis::Client::open(REDIS_URL).expect("Failed to connect to Redis");
    let mut con = client.get_connection().expect("Failed to get Redis connection");

    // Initialize Solana RPC client
    let rpc_client = RpcClient::new(RPC_URL);

    // Get and validate program ID
    let program_id = match PROGRAM_ID.parse::<Pubkey>() {
        Ok(id) => id,
        Err(e) => {
            eprintln!("Failed to parse program ID: {}", e);
            std::process::exit(1);
        }
    };
    println!("Using program ID: {}", program_id);

    println!("Glitch Gremlin Worker started");

    loop {
        // Check for new jobs
        match con.rpop::<_, Option<String>>("chaos_jobs", None) {
            Ok(Some(job_data)) => {
                println!("Processing job: {}", job_data);
                if let Err(e) = process_chaos_job(&rpc_client, &program_id, &job_data).await {
                    eprintln!("Error processing job: {}", e);
                }
            }
            Ok(None) => {
                // No jobs available
            }
            Err(e) => {
                eprintln!("Error getting job from Redis: {}", e);
            }
        }

        // Sleep before next poll
        thread::sleep(Duration::from_secs(5));
    }
}
