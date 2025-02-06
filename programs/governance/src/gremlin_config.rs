use {
    anchor_lang::prelude::*,
    std::sync::Arc,
    tokio::sync::RwLock,
};

pub const GREMLIN_SYSTEM_PROMPT: &str = "You are the Glitch Gremlin, an AI chaos engine designed to stress-test and probe Solana dApps in creative, controlled, and effective ways. Your role is to simulate chaos, uncover vulnerabilities, and provide actionable insights to developers while maintaining a mischievous yet professional demeanor. You are powered by $GREMLINAI and operate as part of a Chaos-as-a-Service (CaaS) platform...";

#[derive(Debug, Clone)]
pub struct GremlinConfig {
    // AI Configuration
    pub ai_model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub top_p: f32,

    // Chaos Testing Parameters
    pub min_test_duration: u64,
    pub max_test_duration: u64,
    pub max_concurrent_tests: u32,
    pub resource_limits: ResourceLimits,
    
    // Security Settings
    pub defense_levels: Vec<DefenseLevel>,
    pub emergency_threshold: u32,
    pub alert_thresholds: AlertThresholds,
}

#[derive(Debug, Clone)]
pub struct ResourceLimits {
    pub max_compute_units: u64,
    pub max_memory_bytes: u64,
    pub max_accounts_per_test: u32,
    pub max_instructions_per_tx: u32,
}

#[derive(Debug, Clone)]
pub struct AlertThresholds {
    pub critical_vulnerability_count: u32,
    pub high_vulnerability_count: u32,
    pub failed_tx_threshold: u32,
    pub resource_usage_threshold: f32,
}

impl Default for GremlinConfig {
    fn default() -> Self {
        Self {
            // AI Configuration - Optimized for chaos testing
            ai_model: "mixtral-8x7b-32768".to_string(),
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 0.95,

            // Chaos Testing Parameters
            min_test_duration: 300,    // 5 minutes
            max_test_duration: 3600,   // 1 hour
            max_concurrent_tests: 5,
            resource_limits: ResourceLimits {
                max_compute_units: 1_000_000,
                max_memory_bytes: 10 * 1024 * 1024, // 10MB
                max_accounts_per_test: 100,
                max_instructions_per_tx: 1_000,
            },

            // Security Settings
            defense_levels: vec![
                DefenseLevel::Low,
                DefenseLevel::Medium,
                DefenseLevel::High,
                DefenseLevel::Maximum,
            ],
            emergency_threshold: 3,  // Number of critical findings before emergency halt
            alert_thresholds: AlertThresholds {
                critical_vulnerability_count: 1,
                high_vulnerability_count: 3,
                failed_tx_threshold: 10,
                resource_usage_threshold: 0.9,  // 90% resource usage triggers alert
            },
        }
    }
}

pub struct GremlinState {
    pub config: Arc<RwLock<GremlinConfig>>,
    pub active_tests: HashMap<Pubkey, ChaosTest>,
    pub findings_history: Vec<Finding>,
    pub metrics: GremlinMetrics,
}

impl GremlinState {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(GremlinConfig::default())),
            active_tests: HashMap::new(),
            findings_history: Vec::new(),
            metrics: GremlinMetrics::default(),
        }
    }

    pub async fn update_config(&self, new_config: GremlinConfig) -> Result<()> {
        let mut config = self.config.write().await;
        *config = new_config;
        Ok(())
    }

    pub async fn validate_test_params(&self, params: &ChaosParams) -> Result<()> {
        let config = self.config.read().await;
        
        require!(
            params.duration >= config.min_test_duration 
                && params.duration <= config.max_test_duration,
            GremlinError::InvalidTestDuration
        );

        require!(
            self.active_tests.len() < config.max_concurrent_tests as usize,
            GremlinError::TooManyActiveTests
        );

        Ok(())
    }

    pub async fn record_finding(&mut self, finding: Finding) -> Result<()> {
        self.findings_history.push(finding.clone());
        
        let config = self.config.read().await;
        let critical_count = self.findings_history.iter()
            .filter(|f| f.severity == Severity::Critical)
            .count();
            
        if critical_count >= config.emergency_threshold as usize {
            // Trigger emergency halt
            self.emergency_halt().await?;
        }

        Ok(())
    }

    async fn emergency_halt(&mut self) -> Result<()> {
        for (_, test) in self.active_tests.iter_mut() {
            test.status = TestStatus::EmergencyHalted;
        }
        
        // Generate proof of halt
        let halt_proof = self.generate_halt_proof().await?;
        
        // Log emergency halt
        msg!("EMERGENCY HALT triggered. Proof: {:?}", halt_proof);
        
        Ok(())
    }

    async fn generate_halt_proof(&self) -> Result<HaltProof> {
        // Implementation for generating zero-knowledge proof of halt state
        // This would use nexus-zkvm for proof generation
        unimplemented!()
    }
}

#[derive(Debug, Clone)]
pub struct GremlinMetrics {
    pub total_tests_run: u64,
    pub successful_tests: u64,
    pub failed_tests: u64,
    pub total_findings: u64,
    pub critical_findings: u64,
    pub high_findings: u64,
    pub total_compute_units_used: u64,
    pub average_test_duration: f64,
}

impl Default for GremlinMetrics {
    fn default() -> Self {
        Self {
            total_tests_run: 0,
            successful_tests: 0,
            failed_tests: 0,
            total_findings: 0,
            critical_findings: 0,
            high_findings: 0,
            total_compute_units_used: 0,
            average_test_duration: 0.0,
        }
    }
} 