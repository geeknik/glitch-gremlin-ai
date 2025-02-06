use anchor_lang::prelude::*;
use tokio::sync::RwLock;
use std::{sync::Arc, time::Duration};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_program::{
    account_info::AccountInfo,
    pubkey::Pubkey,
};
use std::collections::{HashMap, HashSet};
use crate::{
    error::{GovernanceError, Result, WithErrorContext},
    state::{Proposal, ProposalState, Vote, StakeAccount},
};

use crate::{
    chaos::{Finding, FindingSeverity},
    ErrorCode,
};

pub mod auto_response;
pub mod blockchain_monitor;
pub mod proposal_tracker;
pub mod ai_integration;
pub mod dashboard;

use auto_response::AutoResponse;
use blockchain_monitor::BlockchainMonitor;
use ai_integration::GroqAIIntegration;
use dashboard::{SecurityDashboard, SecurityMetrics, ProposalExecutionStats, TreasuryStats};

pub const MONITORING_INTERVAL_SECS: u64 = 30;
pub const HIGH_COST_THRESHOLD: u64 = 1_000_000;
pub const RATE_LIMIT_WINDOW: i64 = 60;
pub const MAX_OPERATIONS_PER_WINDOW: u64 = 10;
pub const CIRCUIT_BREAKER_THRESHOLD: u64 = 25;

#[derive(Debug)]
pub struct MonitoringMetrics {
    pub security_metrics: SecurityMetrics,
    pub last_check: i64,
    pub alerts: Vec<Alert>,
}

#[derive(Debug)]
pub struct Alert {
    pub severity: AlertSeverity,
    pub message: String,
    pub timestamp: i64,
    pub related_accounts: Vec<Pubkey>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AlertSeverity {
    Critical,
    High,
    Medium,
    Low,
}

impl MonitoringMetrics {
    pub fn new() -> Self {
        Self {
            security_metrics: SecurityMetrics::new(),
            last_check: Clock::get().unwrap_or_default().unix_timestamp,
            alerts: Vec::new(),
        }
    }

    pub fn add_alert(&mut self, severity: AlertSeverity, message: String, accounts: Vec<Pubkey>) {
        self.alerts.push(Alert {
            severity,
            message,
            timestamp: Clock::get().unwrap_or_default().unix_timestamp,
            related_accounts: accounts,
        });
    }
}

pub struct SecurityMonitor {
    program_id: Pubkey,
    dashboard: Arc<RwLock<SecurityDashboard>>,
    auto_response: Option<AutoResponse>,
    blockchain_monitor: BlockchainMonitor,
    ai_integration: Option<GroqAIIntegration>,
    operation_timestamps: Vec<i64>,
    last_rate_check: i64,
}

impl SecurityMonitor {
    pub fn new(program_id: Pubkey, rpc_url: String) -> Result<Self> {
        let dashboard = Arc::new(RwLock::new(SecurityDashboard::new(program_id, "monitoring_db")?));
        let blockchain_monitor = BlockchainMonitor::new(program_id);
        let auto_response = Some(AutoResponse::new(Default::default()));
        
        Ok(Self {
            program_id,
            dashboard,
            auto_response,
            blockchain_monitor,
            ai_integration: None,
            operation_timestamps: Vec::new(),
            last_rate_check: Clock::get()?.unix_timestamp,
        })
    }

    pub async fn start_monitoring(&self) -> Result<()> {
        let mut interval = tokio::time::interval(Duration::from_secs(MONITORING_INTERVAL_SECS));

        loop {
            interval.tick().await;
            if let Err(e) = self.monitor_cycle().await {
                msg!("Error in monitoring cycle: {}", e);
            }
        }
    }

    async fn monitor_cycle(&self) -> Result<()> {
        // Check rate limiting first
        self.check_rate_limit()?;
        
        let metrics = self.collect_metrics().await?;
        
        // Validate metrics before updating
        metrics.validate()?;
        
        // Check for circuit breaker conditions
        if self.should_trigger_circuit_breaker(&metrics)? {
            msg!("Circuit breaker triggered! Halting operations.");
            return Err(GovernanceError::CircuitBreakerTriggered)
                .with_context("Monitoring", "Circuit breaker triggered due to security threshold breach");
        }
        
        let dashboard = self.dashboard.clone();
        if let Ok(mut dash) = dashboard.write().await {
            dash.update_metrics(&metrics)?;
        }

        Ok(())
    }

    fn check_rate_limit(&mut self) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp;
        
        // Clean up old timestamps
        self.operation_timestamps.retain(|&ts| 
            current_time - ts <= RATE_LIMIT_WINDOW
        );
        
        // Check if we're over the limit
        if self.operation_timestamps.len() as u64 >= MAX_OPERATIONS_PER_WINDOW {
            return Err(GovernanceError::RateLimitExceeded)
                .with_context("Rate Limiting", "Too many operations in time window");
        }
        
        // Record new operation
        self.operation_timestamps.push(current_time);
        self.last_rate_check = current_time;
        
        Ok(())
    }

    fn should_trigger_circuit_breaker(&self, metrics: &SecurityMetrics) -> Result<bool> {
        // Check total manipulation attempts
        let total_manipulations = metrics.vote_manipulations
            .checked_add(metrics.execution_manipulations)
            .and_then(|sum| sum.checked_add(metrics.state_manipulations))
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Circuit Breaker", "Failed to calculate total manipulations")?;
            
        if total_manipulations > CIRCUIT_BREAKER_THRESHOLD {
            return Ok(true);
        }
        
        // Check exploit attempts
        let total_exploits: u64 = metrics.exploit_attempts.values().sum();
        if total_exploits > CIRCUIT_BREAKER_THRESHOLD {
            return Ok(true);
        }
        
        // Check failure rate
        if metrics.failed_transactions > metrics.total_transactions.checked_div(2)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Circuit Breaker", "Failed to calculate failure rate")? {
            return Ok(true);
        }
        
        Ok(false)
    }

    async fn collect_metrics(&self) -> Result<SecurityMetrics> {
        let mut metrics = SecurityMetrics::new();
        
        // Collect basic metrics
        metrics.total_transactions = self.get_total_transactions().await?;
        metrics.failed_transactions = self.get_failed_transactions().await?;
        
        // Update timestamp
        metrics.timestamp = Clock::get()?.unix_timestamp;
        
        Ok(metrics)
    }

    async fn get_total_transactions(&self) -> Result<u64> {
        let rpc_client = RpcClient::new(std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()));
        self.blockchain_monitor.get_total_transactions(&rpc_client).await
    }

    async fn get_failed_transactions(&self) -> Result<u64> {
        let rpc_client = RpcClient::new(std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string()));
        self.blockchain_monitor.get_failed_transactions(&rpc_client).await
    }
}

#[derive(Debug, Clone)]
pub enum ManipulationType {
    Vote,
    Execution,
    State,
}

pub fn initialize_monitoring(program_id: &Pubkey) -> Result<()> {
    // Initialize security dashboard with enhanced metrics
    let security_dashboard = SecurityDashboard::new(*program_id, "monitoring_db")
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to create security dashboard")?;
        
    // Initialize blockchain monitor with extended validation
    let blockchain_monitor = BlockchainMonitor::new(*program_id);
    
    // Initialize AI integration for advanced threat detection
    let ai_integration = match GroqAIIntegration::new() {
        Ok(ai) => Some(ai),
        Err(e) => {
            msg!("Warning: AI integration failed to initialize: {}", e);
            None
        }
    };
    
    // Set up rate limiter with dynamic thresholds
    let rate_limiter = RateLimiter::new(
        RATE_LIMIT_WINDOW,
        MAX_OPERATIONS_PER_WINDOW
    );
    
    // Initialize resource monitor
    let resource_monitor = ResourceMonitor::new(
        HIGH_COST_THRESHOLD,
        256 * 1024 * 1024 // 256MB memory limit
    );
    
    // Set up chaos test monitor
    let chaos_monitor = ChaosTestMonitor::new(*program_id);
    
    // Initialize auto-response system
    let auto_response = AutoResponse::new(Default::default());
    
    // Verify initial state
    security_dashboard.verify_initial_state()?;
    
    // Set up emergency circuit breaker
    security_dashboard.initialize_circuit_breaker(
        CIRCUIT_BREAKER_THRESHOLD,
        vec![
            ManipulationType::Vote,
            ManipulationType::Execution,
            ManipulationType::State
        ]
    )?;
    
    // Store components in global state
    SECURITY_DASHBOARD.set(security_dashboard)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set security dashboard")?;
        
    BLOCKCHAIN_MONITOR.set(blockchain_monitor)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set blockchain monitor")?;
        
    RATE_LIMITER.set(rate_limiter)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set rate limiter")?;
        
    RESOURCE_MONITOR.set(resource_monitor)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set resource monitor")?;
        
    CHAOS_MONITOR.set(chaos_monitor)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set chaos monitor")?;
        
    if let Some(ai) = ai_integration {
        AI_INTEGRATION.set(ai)
            .map_err(|_| GovernanceError::MonitoringInitializationFailed)
            .with_context("Monitoring", "Failed to set AI integration")?;
    }
    
    msg!("Monitoring system initialized successfully");
    Ok(())
}

pub fn update_metrics(
    program_id: &Pubkey,
    transaction_success: bool,
    error_msg: Option<String>,
) -> Result<()> {
    let mut dashboard = SECURITY_DASHBOARD.get()
        .ok_or(GovernanceError::MonitoringNotInitialized)
        .with_context("Monitoring", "Security dashboard not initialized")?;
        
    let mut monitor = BLOCKCHAIN_MONITOR.get()
        .ok_or(GovernanceError::MonitoringNotInitialized)
        .with_context("Monitoring", "Blockchain monitor not initialized")?;
        
    monitor.record_transaction(transaction_success, error_msg)
        .map_err(|_| GovernanceError::MonitoringUpdateFailed)
        .with_context("Monitoring", "Failed to record transaction")?;
        
    dashboard.update_metrics(&monitor)
        .map_err(|_| GovernanceError::MonitoringUpdateFailed)
        .with_context("Monitoring", "Failed to update metrics")?;
        
    Ok(())
}

pub struct RateLimiter {
    pub window_duration: i64,
    pub max_requests: u64,
    pub request_counts: HashMap<Pubkey, (i64, u64)>, // (last_request_time, count)
}

impl RateLimiter {
    pub fn new(window_duration: i64, max_requests: u64) -> Self {
        Self {
            window_duration,
            max_requests,
            request_counts: HashMap::new(),
        }
    }

    pub fn check_rate_limit(&mut self, user: &Pubkey, current_time: i64) -> Result<()> {
        let (last_time, count) = self.request_counts
            .get(user)
            .copied()
            .unwrap_or((0, 0));

        if current_time - last_time > self.window_duration {
            // Reset counter for new window
            self.request_counts.insert(*user, (current_time, 1));
            Ok(())
        } else {
            // Check if under limit
            if count >= self.max_requests {
                Err(GovernanceError::RateLimitExceeded.into())
            } else {
                self.request_counts.insert(*user, (last_time, count + 1));
                Ok(())
            }
        }
    }

    pub fn get_usage_percentage(&self, user: &Pubkey, current_time: i64) -> f64 {
        if let Some((last_time, count)) = self.request_counts.get(user) {
            if current_time - last_time <= self.window_duration {
                return (*count as f64) / (self.max_requests as f64);
            }
        }
        0.0
    }

    pub fn calculate_fee(&self, user: &Pubkey, base_fee: u64) -> Result<u64> {
        let usage = self.get_usage_percentage(user, Clock::get()?.unix_timestamp);
        
        // Exponential fee increase based on usage
        let multiplier = if usage > 0.8 {
            4 // 4x base fee at >80% usage
        } else if usage > 0.5 {
            2 // 2x base fee at >50% usage
        } else {
            1 // Base fee at low usage
        };

        base_fee.checked_mul(multiplier)
            .ok_or(GovernanceError::ArithmeticError)
    }
}

pub struct ResourceMonitor {
    pub compute_budget: u64,
    pub memory_limit: u64,
    pub usage_metrics: HashMap<Pubkey, ResourceUsage>,
}

impl ResourceMonitor {
    pub fn new(compute_budget: u64, memory_limit: u64) -> Self {
        Self {
            compute_budget,
            memory_limit,
            usage_metrics: HashMap::new(),
        }
    }

    pub fn record_usage(&mut self, program_id: &Pubkey, compute_units: u64, memory_bytes: u64) {
        let usage = self.usage_metrics
            .entry(*program_id)
            .or_insert(ResourceUsage::default());
        
        usage.total_compute_units = usage.total_compute_units
            .saturating_add(compute_units);
        usage.total_memory_bytes = usage.total_memory_bytes
            .saturating_add(memory_bytes);
        usage.request_count = usage.request_count
            .saturating_add(1);
    }

    pub fn check_resource_limits(&self, program_id: &Pubkey) -> Result<()> {
        if let Some(usage) = self.usage_metrics.get(program_id) {
            if usage.total_compute_units > self.compute_budget {
                return Err(GovernanceError::ComputeBudgetExceeded.into());
            }
            if usage.total_memory_bytes > self.memory_limit {
                return Err(GovernanceError::MemoryLimitExceeded.into());
            }
        }
        Ok(())
    }

    pub fn get_usage_metrics(&self, program_id: &Pubkey) -> Option<&ResourceUsage> {
        self.usage_metrics.get(program_id)
    }
}

#[derive(Debug, Default)]
pub struct ResourceUsage {
    pub total_compute_units: u64,
    pub total_memory_bytes: u64,
    pub request_count: u64,
}

// Add chaos test monitoring
pub struct ChaosTestMonitor {
    pub program_id: Pubkey,
    pub active_tests: HashMap<Pubkey, ChaosTestState>,
    pub test_history: Vec<ChaosTestResult>,
    pub resource_monitor: ResourceMonitor,
}

#[derive(Debug)]
pub struct ChaosTestState {
    pub start_time: i64,
    pub params: ChaosParams,
    pub resources_used: ResourceUsage,
    pub findings: Vec<Finding>,
}

impl ChaosTestMonitor {
    pub fn new(program_id: Pubkey) -> Self {
        Self {
            program_id,
            active_tests: HashMap::new(),
            test_history: Vec::new(),
            resource_monitor: ResourceMonitor::new(
                1_000_000, // 1M compute units
                1024 * 1024 * 10, // 10MB memory limit
            ),
        }
    }

    pub fn start_test(&mut self, test_id: Pubkey, params: ChaosParams) -> Result<()> {
        // Validate test parameters
        require!(
            params.duration <= 3600, // Max 1 hour
            GovernanceError::InvalidTestParameters
        );

        // Check active test limit
        require!(
            self.active_tests.len() < 5,
            GovernanceError::TooManyActiveTests
        );

        self.active_tests.insert(test_id, ChaosTestState {
            start_time: Clock::get()?.unix_timestamp,
            params,
            resources_used: ResourceUsage::default(),
            findings: Vec::new(),
        });

        Ok(())
    }

    pub fn record_finding(&mut self, test_id: &Pubkey, finding: Finding) -> Result<()> {
        if let Some(test) = self.active_tests.get_mut(test_id) {
            test.findings.push(finding);
            
            // Check if finding requires immediate action
            if test.findings.len() >= 10 {
                self.emergency_halt_test(test_id)?;
            }
        }
        Ok(())
    }

    pub fn emergency_halt_test(&mut self, test_id: &Pubkey) -> Result<()> {
        if let Some(test) = self.active_tests.remove(test_id) {
            let result = ChaosTestResult {
                findings: test.findings,
                duration: Clock::get()?.unix_timestamp - test.start_time,
                timestamp: Clock::get()?.unix_timestamp,
                success: false,
                errors: vec!["Emergency halt triggered".to_string()],
                lamports_spent: test.resources_used.total_compute_units,
                total_transactions: test.resources_used.request_count,
            };
            self.test_history.push(result);
        }
        Ok(())
    }
} 