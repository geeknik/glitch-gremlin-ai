use solana_program::pubkey::Pubkey;
use thiserror::Error;
use crate::chaos::governance_checks::GovernanceChecker;

#[derive(Error, Debug)]
pub enum VerificationError {
    #[error("Program verification failed: {0}")]
    ProgramVerification(String),
    #[error("State verification failed: {0}")]
    StateVerification(String),
    #[error("Configuration verification failed: {0}")]
    ConfigVerification(String),
    #[error("RPC error: {0}")]
    RpcError(String),
}

/// Post-deployment verification status
#[derive(Debug)]
pub struct VerificationStatus {
    pub program_id: Pubkey,
    pub is_deployed: bool,
    pub is_initialized: bool,
    pub config_valid: bool,
    pub state_valid: bool,
    pub issues: Vec<String>,
    pub warnings: Vec<String>,
}

/// Post-deployment verifier for governance programs
pub struct DeploymentVerifier {
    rpc_client: RpcClient,
    governance_checker: GovernanceChecker,
}

impl DeploymentVerifier {
    pub fn new(rpc_url: &str) -> Result<Self, VerificationError> {
        Ok(Self {
            rpc_client: RpcClient::new(rpc_url.to_string()),
            governance_checker: GovernanceChecker::new(),
        })
    }

    /// Verify a deployed governance program
    pub async fn verify_deployment(
        &self,
        program_id: &Pubkey,
    ) -> Result<VerificationStatus, VerificationError> {
        let mut status = VerificationStatus {
            program_id: *program_id,
            is_deployed: false,
            is_initialized: false,
            config_valid: false,
            state_valid: false,
            issues: Vec::new(),
            warnings: Vec::new(),
        };

        // Check program deployment
        match self.verify_program(program_id).await {
            Ok(_) => status.is_deployed = true,
            Err(e) => status.issues.push(format!("Program verification failed: {}", e)),
        }

        // Check program state
        if status.is_deployed {
            match self.verify_program_state(program_id).await {
                Ok(_) => {
                    status.is_initialized = true;
                    status.state_valid = true;
                }
                Err(e) => status.issues.push(format!("State verification failed: {}", e)),
            }
        }

        // Check governance configuration
        if status.is_initialized {
            match self.verify_governance_config(program_id).await {
                Ok(_) => status.config_valid = true,
                Err(e) => status.issues.push(format!("Config verification failed: {}", e)),
            }
        }

        // Perform security checks
        self.check_security_settings(&mut status).await?;

        Ok(status)
    }

    /// Verify program deployment
    async fn verify_program(&self, program_id: &Pubkey) -> Result<(), VerificationError> {
        let program_data = self.rpc_client
            .get_account(program_id)
            .map_err(|e| VerificationError::RpcError(e.to_string()))?;

        if !program_data.executable {
            return Err(VerificationError::ProgramVerification(
                "Account is not executable".to_string()
            ));
        }

        Ok(())
    }

    /// Verify program state
    async fn verify_program_state(&self, program_id: &Pubkey) -> Result<(), VerificationError> {
        // Derive governance PDA
        let (governance_address, _) = Pubkey::find_program_address(
            &[b"governance"],
            program_id,
        );

        let governance_data = self.rpc_client
            .get_account(&governance_address)
            .map_err(|e| VerificationError::RpcError(e.to_string()))?;

        // Verify account owner
        if governance_data.owner != *program_id {
            return Err(VerificationError::StateVerification(
                "Invalid governance account owner".to_string()
            ));
        }

        Ok(())
    }

    /// Verify governance configuration
    async fn verify_governance_config(&self, program_id: &Pubkey) -> Result<(), VerificationError> {
        // Derive config PDA
        let (config_address, _) = Pubkey::find_program_address(
            &[b"config"],
            program_id,
        );

        let config_data = self.rpc_client
            .get_account(&config_address)
            .map_err(|e| VerificationError::RpcError(e.to_string()))?;

        // Deserialize and validate config
        let config: GovernanceConfig = try_from_slice_unchecked(&config_data.data)
            .map_err(|e| VerificationError::ConfigVerification(e.to_string()))?;

        // Validate configuration parameters
        if config.vote_threshold_percentage == 0 || config.vote_threshold_percentage > 100 {
            return Err(VerificationError::ConfigVerification(
                "Invalid vote threshold percentage".to_string()
            ));
        }

        if config.min_tokens_to_create_proposal == 0 {
            return Err(VerificationError::ConfigVerification(
                "Invalid minimum tokens for proposal creation".to_string()
            ));
        }

        Ok(())
    }

    /// Check security settings
    async fn check_security_settings(&self, status: &mut VerificationStatus) -> Result<(), VerificationError> {
        // Check timelock settings
        if let Ok(config) = self.get_governance_config(&status.program_id).await {
            if config.min_timelock_period < 24 * 60 * 60 {
                status.warnings.push("Timelock period is less than 24 hours".to_string());
            }
        }

        // Check treasury configuration
        if let Ok(treasury) = self.get_treasury_config(&status.program_id).await {
            if treasury.required_signers < 2 {
                status.warnings.push("Treasury requires less than 2 signers".to_string());
            }
        }

        // Check rate limiting
        if let Ok(rate_limits) = self.get_rate_limits(&status.program_id).await {
            if rate_limits.max_proposals_per_day > 10 {
                status.warnings.push("High proposal rate limit detected".to_string());
            }
        }

        Ok(())
    }

    /// Monitor deployment health
    pub async fn monitor_deployment(
        &self,
        program_id: &Pubkey,
        duration: std::time::Duration,
    ) -> Result<Vec<HealthCheck>, VerificationError> {
        let mut health_checks = Vec::new();
        let start_time = std::time::Instant::now();

        while start_time.elapsed() < duration {
            let health = self.check_deployment_health(program_id).await?;
            health_checks.push(health);

            if health.has_critical_issues() {
                break;
            }

            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }

        Ok(health_checks)
    }

    /// Check deployment health
    async fn check_deployment_health(&self, program_id: &Pubkey) -> Result<HealthCheck, VerificationError> {
        let mut health = HealthCheck {
            timestamp: chrono::Utc::now(),
            program_id: *program_id,
            is_responsive: false,
            state_valid: false,
            issues: Vec::new(),
        };

        // Check program responsiveness
        match self.verify_program(program_id).await {
            Ok(_) => health.is_responsive = true,
            Err(e) => health.issues.push(format!("Program not responsive: {}", e)),
        }

        // Check program state if responsive
        if health.is_responsive {
            match self.verify_program_state(program_id).await {
                Ok(_) => health.state_valid = true,
                Err(e) => health.issues.push(format!("Invalid state: {}", e)),
            }
        }

        Ok(health)
    }
}

#[derive(Debug)]
pub struct HealthCheck {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub program_id: Pubkey,
    pub is_responsive: bool,
    pub state_valid: bool,
    pub issues: Vec<String>,
}

impl HealthCheck {
    pub fn has_critical_issues(&self) -> bool {
        !self.is_responsive || !self.state_valid
    }
} 