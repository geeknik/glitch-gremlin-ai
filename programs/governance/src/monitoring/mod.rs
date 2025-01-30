use anchor_lang::prelude::*;
use tokio::sync::RwLock;
use std::{sync::Arc, time::Duration, collections::HashSet, collections::HashMap};
use crate::{
    state::*,
    error::GovernanceError,
};

pub mod auto_response;
pub mod blockchain_monitor;
pub mod proposal_tracker;
pub mod ai_integration;
pub mod dashboard;

use auto_response::{AutoResponse, ResponseConfig};
use blockchain_monitor::{BlockchainMonitor, GovernanceEvent};
use proposal_tracker::ProposalTracker;
use ai_integration::AIIntegration;
use dashboard::SecurityDashboard;

#[derive(Default)]
pub struct MonitoringConfig {
    pub auto_response_enabled: bool,
    pub ai_integration_enabled: bool,
    pub dashboard_enabled: bool,
}

pub struct MonitoringService {
    auto_response: Option<AutoResponse>,
    blockchain_monitor: Arc<BlockchainMonitor>,
    proposal_tracker: Arc<RwLock<ProposalTracker>>,
    ai_integration: Option<AIIntegration>,
    dashboard: Arc<RwLock<SecurityDashboard>>,
}

impl MonitoringService {
    pub async fn new(config: MonitoringConfig) -> Result<Self> {
        let blockchain_monitor = Arc::new(BlockchainMonitor::new());
        let proposal_tracker = Arc::new(RwLock::new(ProposalTracker::new()));
        let dashboard = Arc::new(RwLock::new(SecurityDashboard::new()));

        let auto_response = if config.auto_response_enabled {
            Some(AutoResponse::new(ResponseConfig::default()))
        } else {
            None
        };

        let ai_integration = if config.ai_integration_enabled {
            Some(AIIntegration::new())
        } else {
            None
        };

        Ok(Self {
            auto_response,
            blockchain_monitor,
            proposal_tracker,
            ai_integration,
            dashboard,
        })
    }

    pub async fn start(&self) -> Result<()> {
        let blockchain_monitor = self.blockchain_monitor.clone();
        let proposal_tracker = self.proposal_tracker.clone();
        let dashboard = self.dashboard.clone();

        // Start blockchain monitoring
        tokio::spawn(async move {
            loop {
                if let Ok(events) = blockchain_monitor.get_new_events().await {
                    for event in events {
                        if let Some(proposal) = event.as_proposal() {
                            proposal_tracker.write().await.track_proposal(proposal).await?;
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });

        // Start metrics collection
        let dashboard_clone = dashboard.clone();
        tokio::spawn(async move {
            loop {
                if let Ok(metrics) = blockchain_monitor.get_security_metrics().await {
                    dashboard_clone.write().await.update_metrics(metrics).await?;
                }
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        });

        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct SecurityMetrics {
    pub failed_transactions: u64,
    pub vote_manipulations: u64,
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub total_votes: u64,
    pub unique_voters: HashSet<String>,
    pub treasury_operations: u64,
    pub execution_success_rate: f64,
    pub timestamp: i64,
    pub exploit_attempts: HashMap<String, u64>,
    pub state_manipulations: u64,
    pub execution_manipulations: u64,
    pub proposal_execution_times: Vec<i64>,
}

#[derive(Debug, Clone)]
pub struct SecurityAlert {
    pub message: String,
    pub level: AlertLevel,
    pub timestamp: i64,
    pub program_id: Pubkey,
    pub details: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertLevel {
    Critical,
    High,
    Medium,
    Low,
}

impl Default for AlertLevel {
    fn default() -> Self {
        AlertLevel::Low
    }
}

pub fn start_monitoring(program_id: &Pubkey) -> Result<Arc<RwLock<SecurityDashboard>>> {
    let rrd_path = format!("metrics_{}.rrd", program_id);
    let dashboard = Arc::new(RwLock::new(SecurityDashboard::new(
        *program_id,
        rrd_path,
    )?));
    
    Ok(dashboard)
}

pub async fn monitor_program(program_id: &Pubkey) -> Result<()> {
    let dashboard = start_monitoring(program_id)?;
    let mut interval = tokio::time::interval(Duration::from_secs(MONITORING_INTERVAL_SECS));

    loop {
        interval.tick().await;
        let metrics = collect_metrics(program_id).await?;
        let dashboard_clone = dashboard.clone();
        
        tokio::spawn(async move {
            if let Ok(mut dash) = dashboard_clone.write().await {
                if let Err(e) = dash.update_metrics(&metrics) {
                    error!("Failed to update metrics: {}", e);
                }
            }
        });
    }
}

async fn collect_metrics(program_id: &Pubkey) -> Result<SecurityMetrics> {
    let mut metrics = SecurityMetrics::default();
    
    // Collect basic statistics
    metrics.total_proposals = get_total_proposals(program_id).await?;
    metrics.active_proposals = get_active_proposals(program_id).await?;
    metrics.execution_success_rate = calculate_execution_success_rate(program_id).await?;
    metrics.failed_transactions = get_failed_transactions_count(program_id).await?;
    
    // Collect manipulation attempts
    metrics.vote_manipulations = detect_vote_manipulation(program_id).await?;
    metrics.execution_manipulations = detect_execution_manipulation(program_id).await?;
    metrics.state_manipulations = detect_state_manipulation(program_id).await?;
    
    metrics.timestamp = Clock::get().unwrap().unix_timestamp;
    
    Ok(metrics)
}

async fn detect_vote_manipulation(program_id: &Pubkey) -> Result<u64> {
    // Implementation will be added later
    Ok(0)
}

async fn detect_execution_manipulation(program_id: &Pubkey) -> Result<u64> {
    // Implementation will be added later
    Ok(0)
}

async fn detect_state_manipulation(program_id: &Pubkey) -> Result<u64> {
    // Implementation will be added later
    Ok(0)
}

async fn get_total_proposals(program_id: &Pubkey) -> Result<u64> {
    // Implementation will be added later
    Ok(0)
}

async fn get_active_proposals(program_id: &Pubkey) -> Result<u64> {
    // Implementation will be added later
    Ok(0)
}

async fn calculate_execution_success_rate(program_id: &Pubkey) -> Result<f64> {
    // Implementation will be added later
    Ok(0.0)
}

async fn get_failed_transactions_count(program_id: &Pubkey) -> Result<u64> {
    // Implementation will be added later
    Ok(0)
} 