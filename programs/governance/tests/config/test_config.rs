use {
    solana_program::pubkey::Pubkey,
    std::{time::Duration, sync::Arc},
    tokio::sync::RwLock,
    crate::gremlin_config::{GremlinConfig, GremlinState, ResourceLimits, AlertThresholds},
};

#[derive(Debug)]
pub struct TestConfig {
    pub program_id: Pubkey,
    pub min_stake_amount: u64,
    pub min_proposal_stake: u64,
    pub voting_period: i64,
    pub execution_delay: i64,
    pub gremlin_config: GremlinConfig,
    pub gremlin_state: Arc<RwLock<GremlinState>>,
}

impl Default for TestConfig {
    fn default() -> Self {
        let gremlin_config = GremlinConfig {
            // AI Configuration
            ai_model: "mixtral-8x7b-32768".to_string(),
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 0.95,

            // Chaos Testing Parameters
            min_test_duration: 300,    // 5 minutes
            max_test_duration: 3600,   // 1 hour
            max_concurrent_tests: 5,
            resource_limits: ResourceLimits {
                max_compute_units: 200_000,
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
            emergency_threshold: 3,
            alert_thresholds: AlertThresholds {
                critical_vulnerability_count: 1,
                high_vulnerability_count: 3,
                failed_tx_threshold: 10,
                resource_usage_threshold: 0.9,
            },
        };

        Self {
            program_id: Pubkey::new_unique(),
            min_stake_amount: 1_000_000,
            min_proposal_stake: 5_000_000,
            voting_period: 60 * 60 * 24, // 1 day
            execution_delay: 60 * 60 * 12, // 12 hours
            gremlin_config,
            gremlin_state: Arc::new(RwLock::new(GremlinState::new())),
        }
    }
}

impl TestConfig {
    pub fn new_with_custom_gremlin(
        gremlin_config: GremlinConfig,
        program_id: Option<Pubkey>,
    ) -> Self {
        let mut config = Self::default();
        config.gremlin_config = gremlin_config;
        if let Some(pid) = program_id {
            config.program_id = pid;
        }
        config
    }

    pub async fn validate(&self) -> Result<()> {
        // Validate basic configuration
        require!(
            self.min_stake_amount > 0,
            ConfigError::InvalidMinStake
        );

        require!(
            self.min_proposal_stake >= self.min_stake_amount,
            ConfigError::InvalidProposalStake
        );

        require!(
            self.voting_period > 0,
            ConfigError::InvalidVotingPeriod
        );

        require!(
            self.execution_delay > 0,
            ConfigError::InvalidExecutionDelay
        );

        // Validate Gremlin configuration
        let gremlin_state = self.gremlin_state.read().await;
        
        require!(
            self.gremlin_config.max_test_duration >= self.gremlin_config.min_test_duration,
            ConfigError::InvalidTestDuration
        );

        require!(
            self.gremlin_config.resource_limits.max_compute_units > 0,
            ConfigError::InvalidComputeLimit
        );

        require!(
            self.gremlin_config.resource_limits.max_memory_bytes > 0,
            ConfigError::InvalidMemoryLimit
        );

        require!(
            !self.gremlin_config.defense_levels.is_empty(),
            ConfigError::NoDefenseLevels
        );

        require!(
            (0.0..=1.0).contains(&self.gremlin_config.alert_thresholds.resource_usage_threshold),
            ConfigError::InvalidResourceThreshold
        );

        Ok(())
    }

    pub async fn initialize_monitoring(&self) -> Result<()> {
        let mut gremlin_state = self.gremlin_state.write().await;
        gremlin_state.initialize_monitoring(
            &self.gremlin_config,
            "./monitoring/dashboard.db",
        ).await?;
        Ok(())
    }

    pub fn get_defense_level(&self, risk_level: RiskLevel) -> DefenseLevel {
        match risk_level {
            RiskLevel::Critical => DefenseLevel::Maximum,
            RiskLevel::High => DefenseLevel::High,
            RiskLevel::Medium => DefenseLevel::Medium,
            RiskLevel::Low => DefenseLevel::Low,
        }
    }
} 