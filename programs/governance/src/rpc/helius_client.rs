use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use redis::AsyncCommands;
use solana_program::pubkey::Pubkey;

const HELIUS_RPC_URL: &str = "https://mainnet.helius-rpc.com/";
const CACHE_DURATION: u64 = 300; // 5 minutes
const DAILY_REQUEST_LIMIT: u32 = 333; // ~10K/30 days

#[derive(Debug)]
pub struct HeliusClient {
    client: Client,
    api_key: String,
    redis_client: redis::Client,
    request_counter_key: String,
}

#[derive(Debug, Serialize)]
struct RpcRequest {
    jsonrpc: String,
    id: u32,
    method: String,
    params: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RpcResponse<T> {
    result: T,
}

impl HeliusClient {
    pub fn new(redis_client: redis::Client) -> Result<Self, Box<dyn std::error::Error>> {
        let api_key = env::var("HELIUS_API_KEY")
            .map_err(|_| "HELIUS_API_KEY environment variable not set")?;

        Ok(Self {
            client: Client::new(),
            api_key,
            redis_client,
            request_counter_key: "helius:daily_requests".to_string(),
        })
    }

    /// Get program data with caching
    pub async fn get_program_data(
        &self,
        program_id: &Pubkey,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let cache_key = format!("program:{}:data", program_id);
        
        // Try cache first
        let mut redis = self.redis_client.get_async_connection().await?;
        if let Ok(cached_data) = redis.get::<_, Vec<u8>>(&cache_key).await {
            return Ok(cached_data);
        }

        // Check rate limit
        self.check_rate_limit().await?;

        // Make RPC request
        let request = RpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "getAccountInfo".to_string(),
            params: vec![
                serde_json::to_value(program_id.to_string())?,
                serde_json::json!({
                    "encoding": "base64",
                }),
            ],
        };

        let response: RpcResponse<serde_json::Value> = self.client
            .post(format!("{}{}", HELIUS_RPC_URL, self.api_key))
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        let data = base64::decode(
            response.result["data"][0]
                .as_str()
                .ok_or("Invalid response format")?
        )?;

        // Cache result
        redis.set_ex(&cache_key, &data, CACHE_DURATION as usize).await?;

        Ok(data)
    }

    /// Get program deployment status
    pub async fn get_program_deployment_status(
        &self,
        program_id: &Pubkey,
    ) -> Result<ProgramStatus, Box<dyn std::error::Error>> {
        let cache_key = format!("program:{}:status", program_id);
        
        // Try cache first
        let mut redis = self.redis_client.get_async_connection().await?;
        if let Ok(cached_status) = redis.get::<_, String>(&cache_key).await {
            return Ok(serde_json::from_str(&cached_status)?);
        }

        // Check rate limit
        self.check_rate_limit().await?;

        // Make RPC request
        let request = RpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "getProgramAccounts".to_string(),
            params: vec![
                serde_json::to_value("BPFLoaderUpgradeab1e11111111111111111111111")?
            ],
        };

        let response: RpcResponse<Vec<serde_json::Value>> = self.client
            .post(format!("{}{}", HELIUS_RPC_URL, self.api_key))
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        let status = if response.result.iter().any(|acc| acc["pubkey"] == program_id.to_string()) {
            ProgramStatus::Deployed
        } else {
            ProgramStatus::NotDeployed
        };

        // Cache result
        redis.set_ex(&cache_key, serde_json::to_string(&status)?, CACHE_DURATION as usize).await?;

        Ok(status)
    }

    /// Get priority fee estimate
    pub async fn get_priority_fee(
        &self,
    ) -> Result<u64, Box<dyn std::error::Error>> {
        let cache_key = "priority_fee";
        
        // Try cache first
        let mut redis = self.redis_client.get_async_connection().await?;
        if let Ok(cached_fee) = redis.get::<_, u64>(cache_key).await {
            return Ok(cached_fee);
        }

        // Check rate limit
        self.check_rate_limit().await?;

        // Make RPC request
        let request = RpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "getRecentPrioritizationFees".to_string(),
            params: vec![],
        };

        let response: RpcResponse<Vec<serde_json::Value>> = self.client
            .post(format!("{}{}", HELIUS_RPC_URL, self.api_key))
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        let fee = response.result
            .iter()
            .map(|fee| fee["prioritizationFee"].as_u64().unwrap_or(0))
            .max()
            .unwrap_or(10_000); // Default to 10,000 microlamports

        // Cache result for 1 minute
        redis.set_ex(cache_key, fee, 60).await?;

        Ok(fee)
    }

    /// Check rate limit and increment counter
    async fn check_rate_limit(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut redis = self.redis_client.get_async_connection().await?;
        
        // Get current count
        let count: u32 = redis.get(&self.request_counter_key).await.unwrap_or(0);
        
        if count >= DAILY_REQUEST_LIMIT {
            return Err("Daily API request limit exceeded".into());
        }

        // Increment counter with 24h expiry
        redis.incr(&self.request_counter_key, 1).await?;
        redis.expire(&self.request_counter_key, 24 * 60 * 60).await?;

        Ok(())
    }

    /// Deploy program using optimal settings
    pub async fn deploy_program(
        &self,
        program_data: Vec<u8>,
        keypair_path: &str,
    ) -> Result<Pubkey, Box<dyn std::error::Error>> {
        // Get optimal priority fee
        let priority_fee = self.get_priority_fee().await?;

        // Prepare deploy command with optimal settings
        let mut command = std::process::Command::new("solana");
        command
            .arg("program")
            .arg("deploy")
            .arg("--keypair")
            .arg(keypair_path)
            .arg("--with-compute-unit-price")
            .arg(priority_fee.to_string())
            .arg("--max-sign-attempts")
            .arg("1000") // Increased for reliability
            .arg("--use-rpc"); // Using Helius stake-weighted RPC

        // Execute deployment
        let output = command.output()?;
        if !output.status.success() {
            return Err(format!(
                "Program deployment failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ).into());
        }

        // Parse program ID from output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let program_id = stdout
            .lines()
            .find(|line| line.contains("Program Id:"))
            .and_then(|line| line.split(':').nth(1))
            .map(|id| id.trim())
            .ok_or("Could not find program ID in output")?;

        Ok(Pubkey::try_from(program_id)?)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ProgramStatus {
    Deployed,
    NotDeployed,
} 