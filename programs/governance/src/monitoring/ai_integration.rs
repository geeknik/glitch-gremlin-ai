use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};

const GROQ_API_URL: &str = "https://api.groq.com/v1/chat/completions";
const SYSTEM_PROMPT: &str = r#"You are an expert AI assistant specializing in Solana smart contract testing and security analysis. Your role is to:

1. Analyze governance proposals for testing Solana programs
2. Generate optimal test scenarios based on proposal parameters
3. Identify potential security risks and vulnerabilities
4. Recommend test configurations and parameters
5. Provide detailed execution plans for chaos testing

Consider:
- Program security implications
- Resource constraints
- Network impact
- Test coverage
- Risk mitigation

Format your responses as structured JSON with test parameters and execution steps."#;

#[derive(Debug, Serialize, Deserialize)]
struct GroqRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestRecommendation {
    pub test_type: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub execution_steps: Vec<String>,
    pub security_considerations: Vec<String>,
    pub estimated_duration: u64,
    pub resource_requirements: HashMap<String, u64>,
}

pub struct GroqAIIntegration {
    client: reqwest::Client,
    api_key: String,
}

impl GroqAIIntegration {
    pub async fn new(api_key: String) -> Result<Self, Box<dyn std::error::Error>> {
        let client = reqwest::Client::new();
        
        Ok(Self {
            client,
            api_key,
        })
    }

    pub async fn get_test_recommendation(
        &self,
        proposal: &super::blockchain_monitor::GovernanceEvent,
    ) -> Result<TestRecommendation, Box<dyn std::error::Error>> {
        // Extract proposal details
        let proposal_json = match proposal {
            super::blockchain_monitor::GovernanceEvent::ProposalCreated {
                title,
                description,
                chaos_params,
                ..
            } => {
                serde_json::json!({
                    "title": title,
                    "description": description,
                    "chaos_parameters": chaos_params,
                })
            }
            _ => return Err("Not a proposal event".into()),
        };

        // Prepare request to Groq API
        let messages = vec![
            Message {
                role: "system".to_string(),
                content: SYSTEM_PROMPT.to_string(),
            },
            Message {
                role: "user".to_string(),
                content: format!(
                    "Analyze this governance proposal and provide test recommendations: {}",
                    proposal_json
                ),
            },
        ];

        let request = GroqRequest {
            model: "mixtral-8x7b-32768".to_string(), // Using Mixtral for its technical capabilities
            messages,
            temperature: 0.7,
            max_tokens: 2000,
        };

        // Setup headers
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        // Make request to Groq API
        let response = self.client
            .post(GROQ_API_URL)
            .headers(headers)
            .json(&request)
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        // Parse AI response into TestRecommendation
        let content = response["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("Invalid response format")?;

        let recommendation: TestRecommendation = serde_json::from_str(content)?;

        // Cache the recommendation in Redis for future reference
        self.cache_recommendation(
            proposal_json["title"].as_str().unwrap(),
            &recommendation,
        ).await?;

        Ok(recommendation)
    }

    async fn cache_recommendation(
        &self,
        proposal_title: &str,
        recommendation: &TestRecommendation,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Implementation for caching in Redis
        // This would store the recommendation with an expiration time
        Ok(())
    }

    pub async fn get_security_analysis(
        &self,
        program_id: &str,
        code: &str,
    ) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let messages = vec![
            Message {
                role: "system".to_string(),
                content: SYSTEM_PROMPT.to_string(),
            },
            Message {
                role: "user".to_string(),
                content: format!(
                    "Perform a security analysis of this Solana program ({}): {}",
                    program_id, code
                ),
            },
        ];

        let request = GroqRequest {
            model: "mixtral-8x7b-32768".to_string(),
            messages,
            temperature: 0.3, // Lower temperature for more focused security analysis
            max_tokens: 2000,
        };

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let response = self.client
            .post(GROQ_API_URL)
            .headers(headers)
            .json(&request)
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        let analysis = response["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("Invalid response format")?;

        // Parse the analysis into a vector of security findings
        let findings: Vec<String> = serde_json::from_str(analysis)?;

        Ok(findings)
    }
} 