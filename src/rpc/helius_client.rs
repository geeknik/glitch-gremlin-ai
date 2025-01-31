/// Client for interacting with Helius blockchain RPC API
#[derive(Debug)]
pub struct HeliusClient {
    /// HTTP endpoint URL for RPC requests
    pub endpoint: String,
    /// API key for authenticating requests
    pub api_key: String,
}

impl HeliusClient {
    /// Creates a new Helius client instance
    /// 
    /// # Arguments
    /// * `endpoint` - Full URL of the RPC endpoint  
    /// * `api_key` - Authentication key for API access
    pub fn new(endpoint: String, api_key: String) -> Self {
        Self { endpoint, api_key }
    }
} 
