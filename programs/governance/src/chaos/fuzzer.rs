use libafl::prelude::*;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Arc};
use tokio::sync::Mutex;
use crate::chaos::security::{SecuritySanitizer, SecurityError};

/// Configuration for the chaos fuzzing engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosFuzzerConfig {
    pub groq_api_key: String,
    pub program_id: String,
    pub max_iterations: usize,
    pub corpus_dir: PathBuf,
    pub timeout_ms: u64,
    pub compute_unit_limit: u32,
}

/// Represents a chaos test case
#[derive(Debug, Serialize, Deserialize)]
pub struct ChaosTestCase {
    pub name: String,
    pub description: String,
    pub instruction_data: Vec<u8>,
    pub accounts: Vec<AccountConfig>,
    pub expected_result: ExpectedResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountConfig {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ExpectedResult {
    Success,
    FailWith(String),
    Revert,
    Timeout,
}

/// Main chaos fuzzing engine
pub struct ChaosFuzzer {
    config: ChaosFuzzerConfig,
    ai_agent: Arc<Mutex<GroqAgent>>,
    fuzzer: StdFuzzer,
    executor: InProcessExecutor<'static, ChaosHarness, ChaosTestCase, QemuExecutor>,
    state: StdState<ChaosTestCase, (), ()>,
    scheduler: QueueScheduler<ChaosTestCase>,
}

impl ChaosFuzzer {
    pub async fn new(config: ChaosFuzzerConfig) -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize LibAFL components
        let scheduler = QueueScheduler::new();
        let monitor = SimpleMonitor::new(|s| println!("{}", s));
        let mut feedback = MaxMapFeedback::new(&monitor);
        
        // Create harness for program testing
        let harness = ChaosHarness::new(&config.program_id);
        
        // Setup executor with QEMU for BPF program execution
        let executor = InProcessExecutor::new(
            harness,
            tuple_list!(),
            &mut feedback,
            &mut (),
        )?;

        // Initialize state
        let state = StdState::new(
            StdRand::with_seed(current_nanos()),
            executor.into(),
            tuple_list!(),
            tuple_list!(),
        );

        // Create AI agent
        let ai_agent = Arc::new(Mutex::new(GroqAgent::new(&config.groq_api_key).await?));

        Ok(Self {
            config,
            ai_agent,
            fuzzer: StdFuzzer::new(scheduler, feedback, state),
            executor,
            state,
            scheduler,
        })
    }

    /// Start the chaos fuzzing campaign
    pub async fn run_campaign(&mut self) -> Result<CampaignStats, Box<dyn std::error::Error>> {
        let mut stats = CampaignStats::default();

        for i in 0..self.config.max_iterations {
            // Get next test case from AI agent
            let test_case = self.ai_agent.lock().await.generate_test_case().await?;
            
            // Execute test case
            let result = self.execute_test_case(&test_case).await?;
            
            // Update stats
            stats.update(&result);
            
            // Let AI agent learn from results
            self.ai_agent.lock().await.learn_from_result(&test_case, &result).await?;
            
            // Add interesting test cases to corpus
            if result.is_interesting() {
                self.fuzzer.add_to_corpus(test_case)?;
            }

            // Optional: Early stop on critical issues
            if result.is_critical_failure() {
                break;
            }
        }

        Ok(stats)
    }

    /// Execute a single test case
    async fn execute_test_case(&mut self, test_case: &ChaosTestCase) 
        -> Result<ExecutionResult, Box<dyn std::error::Error>> 
    {
        // Set compute budget for this execution
        let compute_budget = ComputeBudget {
            units: self.config.compute_unit_limit,
            heap_bytes: None,
        };

        // Prepare execution context
        let mut ctx = ExecutionContext {
            test_case: test_case.clone(),
            compute_budget,
            timeout: std::time::Duration::from_millis(self.config.timeout_ms),
        };

        // Execute with timeout
        let result = tokio::time::timeout(
            ctx.timeout,
            self.executor.run(&mut ctx)
        ).await??;

        Ok(result)
    }
}

/// AI Agent powered by GROQ with security hardening
struct GroqAgent {
    client: reqwest::Client,
    api_key: String,
    system_prompt: String,
    security: SecuritySanitizer,
    // Track suspicious activity
    suspicious_attempts: Arc<Mutex<Vec<SuspiciousActivity>>>,
}

#[derive(Debug, Clone)]
struct SuspiciousActivity {
    timestamp: chrono::DateTime<chrono::Utc>,
    activity_type: String,
    details: String,
}

impl GroqAgent {
    async fn new(api_key: &str) -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            client: reqwest::Client::new(),
            api_key: api_key.to_string(),
            system_prompt: include_str!("../prompts/chaos_agent.txt").to_string(),
            security: SecuritySanitizer::new(),
            suspicious_attempts: Arc::new(Mutex::new(Vec::new())),
        })
    }

    async fn generate_test_case(&self) -> Result<ChaosTestCase, Box<dyn std::error::Error>> {
        // Validate system prompt before each request
        self.security.validate_prompt(&self.system_prompt)?;

        // Call GROQ API with security measures
        let response = self.client
            .post("https://api.groq.com/v1/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&serde_json::json!({
                "model": "mixtral-8x7b-32768",
                "messages": [
                    {
                        "role": "system",
                        "content": &self.system_prompt
                    },
                    {
                        "role": "user",
                        "content": "Generate a chaos test case for the governance program"
                    }
                ],
                "temperature": 0.7,
                "max_tokens": 1000,
                "safe_mode": true, // Enable content filtering
            }))
            .send()
            .await?;

        // Validate and sanitize response
        let response_text = response.text().await?;
        let sanitized_response = self.security.sanitize_ai_response(&response_text)?;

        // Parse response into test case with validation
        let test_case: ChaosTestCase = serde_json::from_str(&sanitized_response)?;
        
        // Validate test case
        self.security.validate_test_case(&test_case)?;

        Ok(test_case)
    }

    async fn learn_from_result(
        &self,
        test_case: &ChaosTestCase,
        result: &ExecutionResult,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Prepare learning prompt with security checks
        let learning_prompt = format!(
            "Learn from test case execution:\nTest: {:#?}\nResult: {:#?}",
            test_case, result
        );
        
        // Validate learning prompt
        self.security.validate_prompt(&learning_prompt)?;

        // Call GROQ API with security measures
        let response = self.client
            .post("https://api.groq.com/v1/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&serde_json::json!({
                "model": "mixtral-8x7b-32768",
                "messages": [
                    {
                        "role": "system",
                        "content": &self.system_prompt
                    },
                    {
                        "role": "user",
                        "content": learning_prompt
                    }
                ],
                "temperature": 0.5,
                "max_tokens": 500,
                "safe_mode": true,
            }))
            .send()
            .await?;

        // Track suspicious activity if any security checks fail
        if let Err(err) = self.security.validate_prompt(&response.text().await?) {
            let suspicious = SuspiciousActivity {
                timestamp: chrono::Utc::now(),
                activity_type: "AI Response".to_string(),
                details: format!("Security check failed: {}", err),
            };
            self.suspicious_attempts.lock().await.push(suspicious);
        }

        Ok(())
    }

    /// Check for suspicious activity patterns
    async fn analyze_suspicious_activity(&self) -> Vec<SecurityAlert> {
        let attempts = self.suspicious_attempts.lock().await;
        let mut alerts = Vec::new();

        // Check for rapid suspicious attempts
        let recent_attempts: Vec<_> = attempts
            .iter()
            .filter(|a| {
                (chrono::Utc::now() - a.timestamp).num_minutes() < 5
            })
            .collect();

        if recent_attempts.len() >= 3 {
            alerts.push(SecurityAlert {
                level: AlertLevel::High,
                message: "Multiple suspicious activities detected".to_string(),
                details: format!("{} attempts in 5 minutes", recent_attempts.len()),
            });
        }

        alerts
    }
}

#[derive(Debug)]
pub struct SecurityAlert {
    pub level: AlertLevel,
    pub message: String,
    pub details: String,
}

#[derive(Debug)]
pub enum AlertLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Default)]
pub struct CampaignStats {
    pub total_executions: usize,
    pub successful_tests: usize,
    pub failed_tests: usize,
    pub timeouts: usize,
    pub interesting_cases: usize,
    pub critical_failures: usize,
}

impl CampaignStats {
    fn update(&mut self, result: &ExecutionResult) {
        self.total_executions += 1;
        match result {
            ExecutionResult::Success => self.successful_tests += 1,
            ExecutionResult::Failure(_) => self.failed_tests += 1,
            ExecutionResult::Timeout => self.timeouts += 1,
            ExecutionResult::CriticalFailure(_) => self.critical_failures += 1,
        }
        if result.is_interesting() {
            self.interesting_cases += 1;
        }
    }
}

#[derive(Debug)]
pub enum ExecutionResult {
    Success,
    Failure(String),
    Timeout,
    CriticalFailure(String),
}

impl ExecutionResult {
    fn is_interesting(&self) -> bool {
        matches!(self, Self::Failure(_) | Self::CriticalFailure(_))
    }

    fn is_critical_failure(&self) -> bool {
        matches!(self, Self::CriticalFailure(_))
    }
} 