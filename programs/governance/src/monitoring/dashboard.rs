use anchor_lang::prelude::*;
use crate::chaos::{
    governance_checks::{SecurityMetrics, GovernanceChecker},
    deployment_verifier::{DeploymentVerifier, HealthCheck},
};
use solana_program::pubkey::Pubkey;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use rrd::{RRD, RRADef, DSDef, CF};
use std::time::SystemTime;
use std::collections::HashSet;
use solana_program::clock::Clock;
use crate::monitoring::{SecurityAlert, AlertLevel};

/// Security dashboard for monitoring governance programs
#[derive(Debug)]
pub struct SecurityDashboard {
    pub program_id: Pubkey,
    pub rrd_path: String,
    pub metrics_rrd: Option<RoundRobinDatabase>,
    pub metrics: SecurityMetrics,
    pub alerts: Vec<SecurityAlert>,
    pub last_update: i64,
}

struct ProgramMonitor {
    program_id: Pubkey,
    verifier: Arc<DeploymentVerifier>,
    checker: Arc<RwLock<GovernanceChecker>>,
    health_history: Vec<HealthCheck>,
    metrics_history: Vec<SecurityMetrics>,
}

impl SecurityDashboard {
    pub fn new(program_id: Pubkey, rrd_path: String) -> Result<Self> {
        Ok(Self {
            program_id,
            rrd_path,
            metrics_rrd: None,
            metrics: SecurityMetrics::default(),
            alerts: Vec::new(),
            last_update: Clock::get()?.unix_timestamp,
        })
    }

    /// Add a program to monitor
    pub async fn add_program(
        &mut self,
        program_id: Pubkey,
        rpc_url: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let verifier = Arc::new(DeploymentVerifier::new(rpc_url)?);
        let checker = Arc::new(RwLock::new(GovernanceChecker::new()));

        self.programs.insert(program_id, ProgramMonitor {
            program_id,
            verifier,
            checker,
            health_history: Vec::new(),
            metrics_history: Vec::new(),
        });

        Ok(())
    }

    /// Start monitoring all programs
    pub async fn start_monitoring(&mut self) -> Result<()> {
        // Initialize monitoring
        self.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Get security status for all programs
    pub async fn get_security_status(&self) -> HashMap<Pubkey, SecurityStatus> {
        let mut status = HashMap::new();
        
        for (program_id, monitor) in &self.programs {
            let health = monitor.health_history.last().cloned();
            let metrics = monitor.metrics_history.last().cloned();
            
            status.insert(*program_id, SecurityStatus {
                program_id: *program_id,
                health,
                metrics,
                alert_level: self.calculate_alert_level(health.as_ref(), metrics.as_ref()),
            });
        }
        
        status
    }

    /// Calculate alert level based on security metrics
    fn calculate_alert_level(
        &self,
        health: Option<&HealthCheck>,
        metrics: Option<&SecurityMetrics>,
    ) -> AlertLevel {
        if let Some(health) = health {
            if !health.is_responsive || !health.state_valid {
                return AlertLevel::Critical;
            }
        }

        if let Some(metrics) = metrics {
            let total_exploits: u64 = metrics.exploit_attempts.values().sum();
            
            if total_exploits > 100 {
                AlertLevel::High
            } else if total_exploits > 50 {
                AlertLevel::Medium
            } else if total_exploits > 10 {
                AlertLevel::Low
            } else {
                AlertLevel::Info
            }
        } else {
            AlertLevel::Info
        }
    }

    /// Generate security report
    pub fn generate_report(&self, program_id: &Pubkey) -> Option<SecurityReport> {
        let monitor = self.programs.get(program_id)?;
        let recent_metrics = monitor.metrics_history.last()?;
        
        Some(SecurityReport {
            timestamp: Utc::now(),
            program_id: *program_id,
            total_exploit_attempts: recent_metrics.exploit_attempts.values().sum(),
            unique_attackers: recent_metrics.unique_attackers.len(),
            attack_types: recent_metrics.exploit_attempts.clone(),
            recommendations: self.generate_recommendations(recent_metrics),
        })
    }

    /// Generate security recommendations
    pub fn generate_recommendations(
        &self,
        metrics: &SecurityMetrics,
    ) -> Vec<String> {
        let mut recommendations = Vec::new();
        
        if metrics.failed_transactions > 10 {
            recommendations.push("High number of failed transactions detected. Consider reviewing transaction validation.".to_string());
        }
        
        if metrics.vote_manipulations > 0 {
            recommendations.push("Vote manipulation attempts detected. Consider increasing security measures.".to_string());
        }
        
        if metrics.total_proposals > 50 {
            recommendations.push("High number of proposals. Consider implementing rate limiting.".to_string());
        }
        
        recommendations
    }

    /// Generate dashboard view
    pub fn generate_dashboard_view(&self) -> DashboardView {
        let current_time = Clock::get().unwrap_or_default().unix_timestamp;
        
        DashboardView {
            total_proposals: self.metrics.total_proposals,
            active_proposals: self.metrics.active_proposals,
            execution_success_rate: self.metrics.execution_success_rate,
            failed_transactions: self.metrics.failed_transactions,
            unique_voters: self.metrics.unique_voters.len() as u64,
            vote_manipulation_attempts: self.metrics.vote_manipulations,
            execution_manipulation_attempts: self.metrics.execution_manipulations,
            state_manipulation_attempts: self.metrics.state_manipulations,
            proposal_execution_stats: self.metrics.proposal_execution_times.clone(),
            treasury_operations_stats: self.metrics.treasury_operations.clone(),
        }
    }

    /// Generate metrics view
    fn generate_metrics_view(&self) -> MetricsView {
        let mut vote_manipulation_attempts = Vec::new();
        let mut execution_manipulation_attempts = Vec::new();
        let mut state_manipulation_attempts = Vec::new();
        let mut execution_times = Vec::new();
        let mut treasury_operations = Vec::new();

        // Collect metrics from all programs
        for monitor in self.programs.values() {
            for metrics in &monitor.metrics_history {
                vote_manipulation_attempts.push((metrics.timestamp, metrics.vote_manipulations));
                execution_manipulation_attempts.push((metrics.timestamp, metrics.execution_manipulations));
                state_manipulation_attempts.push((metrics.timestamp, metrics.state_manipulations));
                execution_times.extend(metrics.proposal_execution_times.iter());
                treasury_operations.push(metrics.treasury_operations);
            }
        }

        // Calculate proposal execution stats
        let proposal_execution_stats = ProposalExecutionStats {
            avg_execution_time: execution_times.iter().sum::<i64>() as f64 / execution_times.len() as f64,
            max_execution_time: *execution_times.iter().max().unwrap_or(&0),
            min_execution_time: *execution_times.iter().min().unwrap_or(&0),
            execution_time_distribution: self.calculate_time_distribution(&execution_times),
        };

        // Calculate treasury stats
        let treasury_stats = TreasuryStats {
            total_operations: treasury_operations.iter().sum(),
            total_volume: 0, // Would need actual volume data
            largest_operation: 0, // Would need actual operation size data
            operation_distribution: HashMap::new(), // Would need operation type data
        };

        MetricsView {
            vote_manipulation_attempts,
            execution_manipulation_attempts,
            state_manipulation_attempts,
            proposal_execution_stats,
            treasury_operations_stats: treasury_stats,
        }
    }

    /// Calculate time distribution for execution times
    fn calculate_time_distribution(&self, times: &[i64]) -> HashMap<String, usize> {
        let mut distribution = HashMap::new();
        
        for &time in times {
            let bucket = match time {
                t if t < 3600 => "< 1h",
                t if t < 7200 => "1-2h",
                t if t < 14400 => "2-4h",
                t if t < 28800 => "4-8h",
                _ => "> 8h",
            };
            *distribution.entry(bucket.to_string()).or_insert(0) += 1;
        }
        
        distribution
    }

    pub async fn update_metrics(&mut self, metrics: &SecurityMetrics) -> Result<()> {
        self.metrics = metrics.clone();
        self.last_update = Clock::get()?.unix_timestamp;
        self.process_alerts()?;
        Ok(())
    }

    fn process_alerts(&mut self) -> Result<()> {
        // Process high transaction failure rate
        if self.metrics.failed_transactions > 100 {
            self.alerts.push(SecurityAlert {
                message: "High transaction failure rate detected".to_string(),
                level: AlertLevel::High,
                timestamp: Clock::get()?.unix_timestamp,
                program_id: self.program_id,
                details: format!("Failed transactions: {}", self.metrics.failed_transactions),
            });
        }

        // Process vote manipulation attempts
        if self.metrics.vote_manipulations > 0 {
            self.alerts.push(SecurityAlert {
                message: "Vote manipulation attempts detected".to_string(),
                level: AlertLevel::Critical,
                timestamp: Clock::get()?.unix_timestamp,
                program_id: self.program_id,
                details: format!("Vote manipulations: {}", self.metrics.vote_manipulations),
            });
        }

        Ok(())
    }

    pub fn get_metrics_view(&self) -> MetricsView {
        MetricsView {
            active_proposals: self.metrics.active_proposals,
            execution_success_rate: self.metrics.execution_success_rate,
            failed_transactions: self.metrics.failed_transactions,
            proposal_execution_stats: ProposalExecutionStats {
                total_executed: 0, // Will be implemented
                successful_executions: 0,
                failed_executions: 0,
                average_execution_time: 0.0,
            },
            treasury_stats: TreasuryStats {
                successful_operations: 0,
                failed_operations: 0,
            },
        }
    }
}

#[derive(Debug)]
pub struct SecurityStatus {
    pub program_id: Pubkey,
    pub health: Option<HealthCheck>,
    pub metrics: Option<SecurityMetrics>,
    pub alert_level: AlertLevel,
}

#[derive(Debug)]
pub struct SecurityReport {
    pub timestamp: DateTime<Utc>,
    pub program_id: Pubkey,
    pub total_exploit_attempts: u64,
    pub unique_attackers: usize,
    pub attack_types: HashMap<String, u64>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertLevel {
    Info,
    Normal,
    Low,
    Medium,
    High,
    Critical,
}

impl Default for AlertLevel {
    fn default() -> Self {
        AlertLevel::Normal
    }
}

impl AlertLevel {
    pub fn from_severity(severity: FindingSeverity) -> Self {
        match severity {
            FindingSeverity::Critical => AlertLevel::Critical,
            FindingSeverity::High => AlertLevel::High,
            FindingSeverity::Medium => AlertLevel::Medium,
            FindingSeverity::Low => AlertLevel::Low,
        }
    }
}

#[derive(Debug)]
pub struct DashboardView {
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub execution_success_rate: f64,
    pub failed_transactions: u64,
    pub unique_voters: u64,
    pub vote_manipulation_attempts: u64,
    pub execution_manipulation_attempts: u64,
    pub state_manipulation_attempts: u64,
    pub proposal_execution_stats: ProposalExecutionStats,
    pub treasury_operations_stats: TreasuryStats,
}

#[derive(Debug, Clone, Default)]
pub struct SecurityMetrics {
    pub failed_transactions: u64,
    pub vote_manipulations: u64,
    pub total_proposals: u64,
    pub total_votes: u64,
    pub unique_voters: HashSet<Pubkey>,
    pub treasury_operations: u64,
    pub execution_success_rate: f64,
    pub timestamp: i64,
    pub exploit_attempts: HashMap<String, u64>,
    pub state_manipulations: u64,
    pub execution_manipulations: u64,
    pub proposal_execution_times: Vec<i64>,
    pub active_proposals: u64,
}

impl Default for SecurityMetrics {
    fn default() -> Self {
        Self {
            failed_transactions: 0,
            vote_manipulations: 0,
            total_proposals: 0,
            total_votes: 0,
            unique_voters: HashSet::new(),
            treasury_operations: 0,
            execution_success_rate: 0.0,
            timestamp: 0,
            exploit_attempts: HashMap::new(),
            state_manipulations: 0,
            execution_manipulations: 0,
            proposal_execution_times: Vec::new(),
            active_proposals: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SecurityAlert {
    pub level: AlertLevel,
    pub message: String,
    pub timestamp: i64,
    pub program_id: Pubkey,
    pub details: String,
}

#[derive(Debug, Clone)]
pub struct SecuritySummary {
    pub total_alerts: u64,
    pub critical_alerts: u64,
    pub high_alerts: u64,
    pub medium_alerts: u64,
    pub low_alerts: u64,
    pub last_alert_timestamp: Option<i64>,
    pub metrics: MetricsView,
    pub total_programs: usize,
    pub total_exploit_attempts: u64,
}

impl Default for SecuritySummary {
    fn default() -> Self {
        Self {
            total_alerts: 0,
            critical_alerts: 0,
            high_alerts: 0,
            medium_alerts: 0,
            low_alerts: 0,
            last_alert_timestamp: None,
            metrics: MetricsView::default(),
            total_programs: 0,
            total_exploit_attempts: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MetricsView {
    pub active_proposals: u64,
    pub execution_success_rate: f64,
    pub failed_transactions: u64,
    pub proposal_execution_stats: ProposalExecutionStats,
    pub treasury_stats: TreasuryStats,
}

impl Default for MetricsView {
    fn default() -> Self {
        Self {
            active_proposals: 0,
            execution_success_rate: 0.0,
            failed_transactions: 0,
            proposal_execution_stats: ProposalExecutionStats::default(),
            treasury_stats: TreasuryStats::default(),
        }
    }
}

impl MetricsView {
    pub fn from_security_metrics(metrics: &SecurityMetrics) -> Self {
        Self {
            active_proposals: metrics.active_proposals,
            execution_success_rate: metrics.execution_success_rate,
            failed_transactions: metrics.failed_transactions,
            proposal_execution_stats: ProposalExecutionStats {
                total_executed: metrics.proposal_execution_stats.total_executed,
                successful_executions: metrics.proposal_execution_stats.successful_executions,
                failed_executions: metrics.proposal_execution_stats.failed_executions,
                average_execution_time: metrics.proposal_execution_stats.average_execution_time,
            },
            treasury_stats: TreasuryStats {
                total_operations: metrics.treasury_operations_stats.total_operations,
                successful_operations: metrics.treasury_operations_stats.successful_operations,
                failed_operations: metrics.treasury_operations_stats.failed_operations,
                total_volume: metrics.treasury_operations_stats.total_volume,
            },
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ProposalExecutionStats {
    pub total_executed: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub average_execution_time: f64,
}

#[derive(Debug, Clone, Default)]
pub struct TreasuryStats {
    pub total_operations: u64,
    pub successful_operations: u64,
    pub failed_operations: u64,
    pub total_volume: u64,
}

const FAILED_TX_THRESHOLD: u64 = 100;
const MANIPULATION_THRESHOLD: u64 = 10; 