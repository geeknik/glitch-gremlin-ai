pub struct HeliusClient {
    pub endpoint: String,
    pub api_key: String,
}

impl HeliusClient {
    pub fn new(endpoint: String, api_key: String) -> Self {
        Self { endpoint, api_key }
    }
} 