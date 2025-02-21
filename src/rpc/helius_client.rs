use solana_program::pubkey::Pubkey;
use crate::state::chaos_request::ChaosRequestStatus;
use anyhow::{Result, Context, anyhow};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::time::SystemTime;

/// RPC method names
const METHOD_GET_ACCOUNT_INFO: &str = "getAccountInfo";
const METHOD_SEND_TRANSACTION: &str = "sendTransaction";

/// Request payload for Helius RPC calls
#[derive(Debug, Serialize)]
struct RpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    params: Vec<Value>,
}

/// Response from Helius RPC
#[derive(Debug, Deserialize)]
struct RpcResponse {
    result: Option<Value>,
    error: Option<RpcError>,
}

/// Error details from RPC
#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
}

/// Account info response with enhanced parsing capabilities
#[derive(Debug, Deserialize)]
struct AccountInfo {
    lamports: u64,
    #[serde(rename = "data")]
    encoded_data: Vec<String>,
    owner: String,
    executable: bool,
    rent_epoch: u64,
}

impl AccountInfo {
    /// Maximum expected data size for a chaos request account
    const MAX_DATA_SIZE: usize = 1024;

    /// Parse the account data to determine chaos request status with enhanced validation
    fn parse_request_status(&self) -> Result<ChaosRequestStatus> {
        // If account has no lamports, it doesn't exist
        if self.lamports == 0 {
            return Ok(ChaosRequestStatus::Failed);
        }

        // Validate executable flag - chaos request accounts should not be executable
        if self.executable {
            return Err(anyhow!("Invalid account: executable flag is set"));
        }

        // Decode and validate base64 data
        let data = if !self.encoded_data.is_empty() {
            let decoded = BASE64.decode(&self.encoded_data[0])
                .context("Failed to decode account data")?;
            
            // Validate data size
            if decoded.len() > Self::MAX_DATA_SIZE {
                return Err(anyhow!("Account data exceeds maximum size"));
            }
            
            decoded
        } else {
            return Ok(ChaosRequestStatus::Pending);
        };

        // Validate minimum data length
        if data.is_empty() {
            return Err(anyhow!("Account data is empty"));
        }

        // Enhanced status parsing with validation
        let status = match data.first() {
            Some(0) => {
                // For pending requests, validate initialization
                if data.len() < 2 || data[1] != 1 {
                    return Err(anyhow!("Invalid pending request initialization"));
                }
                ChaosRequestStatus::Pending
            },
            Some(1) => {
                // For in-progress requests, check progress counter
                if data.len() < 3 {
                    return Err(anyhow!("Invalid in-progress request data"));
                }
                ChaosRequestStatus::InProgress
            },
            Some(2) => {
                // For completed requests, validate completion flag
                if data.len() < 2 || data[1] != 0xFF {
                    return Err(anyhow!("Invalid completion marker"));
                }
                ChaosRequestStatus::Completed
            },
            Some(3) => {
                // For failed requests, extract error code if available
                let error_code = data.get(1).copied().unwrap_or(0);
                println!("Request failed with error code: {}", error_code);
                ChaosRequestStatus::Failed
            },
            Some(status) => {
                // Log unknown status for monitoring
                println!("Warning: Unknown status byte: {}", status);
                ChaosRequestStatus::Pending
            },
            None => return Err(anyhow!("Invalid account data: empty")),
        };

        // Validate rent epoch for account stability
        if self.rent_epoch == 0 {
            println!("Warning: Account may be ephemeral (rent_epoch = 0)");
        }

        Ok(status)
    }

    /// Check if the account is owned by our program with additional validation
    fn validate_owner(&self, expected_owner: &str) -> bool {
        if self.owner.len() != 32 {
            println!("Warning: Invalid owner pubkey length");
            return false;
        }
        self.owner == expected_owner
    }

    /// Get the account's data length
    fn data_len(&self) -> usize {
        self.encoded_data.first()
            .map(|s| s.len())
            .unwrap_or(0)
    }

    /// Check if the account needs reallocation
    fn needs_reallocation(&self) -> bool {
        let data_len = self.data_len();
        data_len > 0 && data_len < Self::MAX_DATA_SIZE / 2
    }
}

/// Configuration for RPC client
#[derive(Debug, Clone)]
pub struct HeliusConfig {
    /// HTTP endpoint URL
    pub endpoint: String,
    /// API key for authentication
    pub api_key: String,
    /// Request timeout in seconds
    pub timeout_secs: u64,
    /// Whether to use mock responses (for testing)
    pub use_mock: bool,
}

impl Default for HeliusConfig {
    fn default() -> Self {
        Self {
            endpoint: "https://api.devnet.solana.com".to_string(),
            api_key: String::new(),
            timeout_secs: 30,
            use_mock: false,
        }
    }
}

/// Client for interacting with Helius blockchain RPC API
#[derive(Debug)]
pub struct HeliusClient {
    /// Client configuration
    config: HeliusConfig,
    /// HTTP client for making requests
    client: HttpClient,
    /// Request ID counter
    request_id: u64,
}

impl HeliusClient {
    /// Creates a new Helius client instance
    /// 
    /// # Arguments
    /// * `endpoint` - Full URL of the RPC endpoint  
    /// * `api_key` - Authentication key for API access
    pub fn new(endpoint: String, api_key: String) -> Self {
        Self::with_config(HeliusConfig {
            endpoint,
            api_key,
            ..Default::default()
        })
    }

    /// Creates a new client with custom configuration
    ///
    /// # Arguments
    /// * `config` - Client configuration options
    pub fn with_config(config: HeliusConfig) -> Self {
        let client = HttpClient::builder()
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self { 
            config,
            client,
            request_id: 0,
        }
    }

    /// Gets the next request ID
    fn next_request_id(&mut self) -> u64 {
        self.request_id += 1;
        self.request_id
    }

    /// Makes an RPC request
    async fn make_request(&mut self, method: &str, params: Vec<Value>) -> Result<Value> {
        if self.config.use_mock {
            return self.mock_response(method, &params);
        }

        let request = RpcRequest {
            jsonrpc: "2.0".to_string(),
            id: self.next_request_id(),
            method: method.to_string(),
            params,
        };

        let response = self.client
            .post(&self.config.endpoint)
            .header("x-api-key", &self.config.api_key)
            .json(&request)
            .send()
            .await
            .context("Failed to send RPC request")?;

        let rpc_response: RpcResponse = response
            .json()
            .await
            .context("Failed to parse RPC response")?;

        match (rpc_response.result, rpc_response.error) {
            (Some(result), None) => Ok(result),
            (None, Some(error)) => {
                Err(anyhow!("RPC error {}: {}", error.code, error.message))
            }
            _ => Err(anyhow!("Invalid RPC response")),
        }
    }

    /// Provides mock responses for testing with simulated status changes
    fn mock_response(&self, method: &str, params: &[Value]) -> Result<Value> {
        match method {
            METHOD_GET_ACCOUNT_INFO => {
                // Get program ID from params
                let program_id = params[0].as_str()
                    .ok_or_else(|| anyhow!("Invalid program ID in params"))?;
                
                // Get current time for time-based status changes
                let now = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Create a deterministic hash from program ID
                let mut hasher = DefaultHasher::new();
                program_id.hash(&mut hasher);
                let hash = hasher.finish();

                // Use hash and time to determine mock status
                let status_byte = match (hash % 6, now % 30) {
                    // Complete requests after 20 seconds
                    (_, t) if t >= 20 => 2,
                    // Fail some requests after 15 seconds
                    (1, t) if t >= 15 => 3,
                    // Cancel some requests after 10 seconds
                    (2, t) if t >= 10 => 4,
                    // Timeout some requests after 25 seconds
                    (3, t) if t >= 25 => 5,
                    // Show in progress after 5 seconds
                    (_, t) if t >= 5 => 1,
                    // Start as pending
                    _ => 0,
                };

                // Create mock account data with additional metadata
                let mut data = vec![status_byte];
                match status_byte {
                    0 => {
                        data.push(1); // Initialization flag
                        data.push((now % 255) as u8); // Random progress indicator
                    }
                    1 => {
                        data.extend_from_slice(&[
                            ((now % 100) as u8), // Progress percentage
                            ((hash % 255) as u8), // Test-specific data
                            ((now % 60) as u8),   // Time remaining estimate
                        ]);
                    }
                    2 => {
                        data.push(0xFF); // Completion marker
                        data.extend_from_slice(&[
                            0x01, // Success flag
                            ((now % 255) as u8), // Result code
                            ((hash % 100) as u8), // Performance score
                        ]);
                    }
                    3 => {
                        data.extend_from_slice(&[
                            42,  // Error code
                            ((hash % 255) as u8), // Error details
                            0x00, // Recovery possible flag
                        ]);
                    }
                    4 | 5 => {
                        data.extend_from_slice(&[
                            ((now % 255) as u8), // Reason code
                            ((hash % 100) as u8), // Additional info
                        ]);
                    }
                    _ => {}
                }

                // Encode data as base64
                let encoded_data = BASE64.encode(&data);

                // Generate mock account info with realistic values
                Ok(serde_json::json!({
                    "context": {
                        "slot": now + (hash % 1000),
                        "apiVersion": "1.16.5",
                        "blockHeight": now / 2 + 1_000_000,
                    },
                    "value": {
                        "data": [encoded_data, "base64"],
                        "executable": false,
                        "lamports": 1_000_000_000 + (hash % 1_000_000),
                        "owner": "11111111111111111111111111111111",
                        "rentEpoch": now / (24 * 60 * 60),
                        "space": data.len(),
                    }
                }))
            }
            METHOD_SEND_TRANSACTION => {
                // Generate deterministic signature based on params
                let mut hasher = DefaultHasher::new();
                for param in params {
                    param.to_string().hash(&mut hasher);
                }
                let hash = hasher.finish();
                
                // Create a realistic-looking transaction signature
                Ok(serde_json::json!(format!(
                    "{:016x}{}",
                    hash,
                    SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                )))
            }
            _ => Err(anyhow!("Mock: Method not supported: {}", method))
        }
    }

    /// Gets the current status of a chaos request with enhanced validation
    ///
    /// # Arguments
    /// * `target_program` - Public key of the program being tested
    ///
    /// # Returns
    /// * `Result<ChaosRequestStatus>` - Current status or error
    pub async fn get_request_status(&mut self, target_program: &Pubkey) -> Result<ChaosRequestStatus> {
        let params = vec![
            serde_json::to_value(target_program.to_string())?,
            serde_json::json!({
                "encoding": "base64",
                "commitment": "confirmed",
                "dataSlice": {
                    "offset": 0,
                    "length": AccountInfo::MAX_DATA_SIZE
                }
            }),
        ];

        let response = self.make_request(METHOD_GET_ACCOUNT_INFO, params).await?;
        
        if self.config.use_mock {
            return Ok(ChaosRequestStatus::Pending);
        }

        // Parse account info from response
        let account_info: AccountInfo = serde_json::from_value(response["value"].clone())
            .context("Failed to parse account info")?;

        // Validate account owner (replace with actual program ID)
        if !account_info.validate_owner("11111111111111111111111111111111") {
            return Err(anyhow!("Invalid account owner"));
        }

        // Check if account needs reallocation
        if account_info.needs_reallocation() {
            println!("Warning: Account may need reallocation for optimal performance");
        }

        // Parse and return status with enhanced validation
        account_info.parse_request_status()
    }

    /// Submits a new chaos request to the network with enhanced validation
    ///
    /// # Arguments
    /// * `request_id` - Unique identifier for the request
    /// * `target_program` - Program to test
    /// * `parameters` - Test parameters as JSON string
    ///
    /// # Returns
    /// * `Result<String>` - Transaction signature or error
    pub async fn submit_request(
        &mut self,
        request_id: &str,
        target_program: &Pubkey,
        parameters: &str,
    ) -> Result<String> {
        // Validate request ID format
        if request_id.len() < 8 || !request_id.starts_with("chaos-") {
            return Err(anyhow!("Invalid request ID format. Must start with 'chaos-' and be at least 8 characters"));
        }

        // Validate parameters JSON
        let params_value: Value = serde_json::from_str(parameters)
            .context("Invalid parameters JSON format")?;

        // Ensure required fields are present
        if !params_value.as_object()
            .map(|obj| obj.contains_key("test_type"))
            .unwrap_or(false) 
        {
            return Err(anyhow!("Parameters must include 'test_type' field"));
        }

        let params = vec![
            serde_json::to_value(request_id)?,
            serde_json::to_value(target_program.to_string())?,
            serde_json::to_value(parameters)?,
        ];

        let response = self.make_request(METHOD_SEND_TRANSACTION, params).await?;
        
        response.as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow!("Invalid transaction signature in response"))
    }

    /// Retrieves the current configuration
    pub fn get_config(&self) -> &HeliusConfig {
        &self.config
    }

    /// Updates the client configuration
    ///
    /// # Arguments
    /// * `config` - New configuration to apply
    pub fn update_config(&mut self, config: HeliusConfig) {
        self.config = config;
    }
} 
