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

pub const MONITORING_INTERVAL_SECS: u64 = 60;
pub const HIGH_COST_THRESHOLD: u64 = 100_000;
pub const RATE_LIMIT_WINDOW: i64 = 300; // 5 minutes
pub const MAX_OPERATIONS_PER_WINDOW: u64 = 100;
pub const CIRCUIT_BREAKER_THRESHOLD: u64 = 50;

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
    let security_dashboard = SecurityDashboard::new(*program_id, "monitoring_db")
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to create security dashboard")?;
        
    let blockchain_monitor = BlockchainMonitor::new(*program_id);
        
    SECURITY_DASHBOARD.set(security_dashboard)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set security dashboard")?;
        
    BLOCKCHAIN_MONITOR.set(blockchain_monitor)
        .map_err(|_| GovernanceError::MonitoringInitializationFailed)
        .with_context("Monitoring", "Failed to set blockchain monitor")?;
        
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