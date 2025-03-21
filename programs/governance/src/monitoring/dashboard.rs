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
    pub metrics: SecurityMetrics,
    pub programs: HashMap<Pubkey, ProgramMonitor>,
    pub rrd_path: String,
}

struct ProgramMonitor {
    program_id: Pubkey,
    verifier: Arc<DeploymentVerifier>,
    checker: Arc<RwLock<GovernanceChecker>>,
    health_history: Vec<HealthCheck>,
    metrics_history: Vec<SecurityMetrics>,
    last_update: i64,
    alert_level: AlertLevel,
    findings: Vec<Finding>,
}

impl SecurityDashboard {
    pub fn new(program_id: Pubkey, rrd_path: String) -> Result<Self> {
        Ok(Self {
            metrics: SecurityMetrics::default(),
            programs: HashMap::new(),
            rrd_path,
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
            last_update: Clock::get()?.unix_timestamp,
            alert_level: AlertLevel::Normal,
            findings: Vec::new(),
        });

        Ok(())
    }

    /// Start monitoring all programs
    pub async fn start_monitoring(&mut self) -> Result<()> {
        // Initialize monitoring
        self.metrics.timestamp = Clock::get()?.unix_timestamp;
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
        DashboardView {
            total_proposals: self.metrics.total_proposals,
            active_proposals: self.metrics.active_proposals,
            execution_success_rate: self.metrics.execution_success_rate,
            failed_transactions: self.metrics.failed_transactions,
            unique_voters: self.metrics.unique_voters.len() as u64,
            vote_manipulation_attempts: self.metrics.vote_manipulations,
            execution_manipulation_attempts: self.metrics.execution_manipulations,
            state_manipulation_attempts: self.metrics.state_manipulations,
            proposal_execution_stats: self.metrics.proposal_execution_stats.clone(),
            treasury_stats: self.metrics.treasury_operations.clone(),
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
            total_executions: execution_times.len() as u64,
            successful_executions: execution_times.iter().filter(|&&x| x > 0).count() as u64,
            failed_executions: execution_times.iter().filter(|&&x| x < &0).count() as u64,
            average_time: execution_times.iter().sum::<i64>() as f64 / execution_times.len() as f64,
            max_time: *execution_times.iter().max().unwrap_or(&0),
            min_time: *execution_times.iter().min().unwrap_or(&0),
            execution_times: execution_times.clone(),
        };

        // Calculate treasury stats
        let treasury_stats = TreasuryStats {
            total_operations: treasury_operations.iter().sum(),
            successful_operations: treasury_operations.iter().filter(|&&x| x > 0).count() as u64,
            failed_operations: treasury_operations.iter().filter(|&&x| x < &0).count() as u64,
            total_volume: 0, // Would need actual volume data
            largest_operation: treasury_operations.iter().max().cloned().unwrap_or(0),
            operation_distribution: treasury_operations.iter().fold(HashMap::new(), |mut dist, &x| {
                *dist.entry(if x > 0 { "successful" } else { "failed" }).or_insert(0) += 1;
                dist
            }),
        };

        MetricsView {
            active_proposals: self.metrics.active_proposals,
            execution_success_rate: self.metrics.execution_success_rate,
            failed_transactions: self.metrics.failed_transactions,
            treasury_stats: treasury_stats,
            vote_manipulation_attempts,
            execution_manipulation_attempts,
            state_manipulation_attempts,
            proposal_execution_stats: proposal_execution_stats,
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

    pub fn update_metrics(&mut self, metrics: &SecurityMetrics) -> Result<()> {
        self.metrics = metrics.clone();
        Ok(())
    }

    pub fn get_metrics_view(&self) -> MetricsView {
        MetricsView {
            active_proposals: self.metrics.active_proposals,
            execution_success_rate: self.metrics.execution_success_rate,
            failed_transactions: self.metrics.failed_transactions,
            treasury_stats: self.metrics.treasury_operations.clone(),
            vote_manipulation_attempts: self.metrics.vote_manipulations,
            execution_manipulation_attempts: self.metrics.execution_manipulations,
            state_manipulation_attempts: self.metrics.state_manipulations,
            proposal_execution_stats: self.metrics.proposal_execution_stats.clone(),
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
    pub treasury_stats: TreasuryStats,
}

#[derive(Debug, Default, Clone)]
pub struct SecurityMetrics {
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub total_votes: u64,
    pub unique_voters: HashSet<Pubkey>,
    pub proposal_execution_stats: ProposalExecutionStats,
    pub treasury_operations: TreasuryStats,
    pub failed_transactions: u64,
    pub execution_success_rate: f64,
    pub vote_manipulations: u64,
    pub execution_manipulations: u64,
    pub state_manipulations: u64,
    pub timestamp: i64,
    
    // New security fields
    pub exploit_attempts: HashMap<String, u64>,
    pub unique_attackers: HashSet<Pubkey>,
    pub anomaly_count: u64,
    pub last_breach_attempt: Option<i64>,
    pub high_risk_operations: Vec<RiskOperation>,
    pub circuit_breaker_triggered: bool,
}

impl SecurityMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_execution(&mut self, success: bool, execution_time: i64) -> Result<()> {
        if success {
            self.proposal_execution_stats.execution_times.push(execution_time);
            self.proposal_execution_stats.successful_executions = self.proposal_execution_stats.successful_executions
                .checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        } else {
            self.proposal_execution_stats.failed_executions = self.proposal_execution_stats.failed_executions
                .checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        
        self.proposal_execution_stats.total_executions = self.proposal_execution_stats.total_executions
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        // Update average time
        if !self.proposal_execution_stats.execution_times.is_empty() {
            self.proposal_execution_stats.average_time = self.proposal_execution_stats.execution_times.iter()
                .sum::<i64>() as f64 / self.proposal_execution_stats.execution_times.len() as f64;
        }
        
        Ok(())
    }

    pub fn record_treasury_operation(&mut self, amount: u64, success: bool) -> Result<()> {
        self.treasury_operations.total_operations = self.treasury_operations.total_operations
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        if success {
            self.treasury_operations.successful_operations = self.treasury_operations.successful_operations
                .checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        } else {
            self.treasury_operations.failed_operations = self.treasury_operations.failed_operations
                .checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        
        self.treasury_operations.total_volume = self.treasury_operations.total_volume
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        if amount > self.treasury_operations.largest_operation {
            self.treasury_operations.largest_operation = amount;
        }
        
        Ok(())
    }

    pub fn validate(&self) -> Result<()> {
        // Validate execution success rate is within bounds
        if self.execution_success_rate < 0.0 || self.execution_success_rate > 1.0 {
            return Err(GovernanceError::InvalidMetrics)
                .with_context("Metrics Validation", "Invalid execution success rate");
        }

        // Check for suspicious manipulation counts
        let total_manipulations = self.vote_manipulations
            .checked_add(self.execution_manipulations)
            .and_then(|sum| sum.checked_add(self.state_manipulations))
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Metrics Validation", "Manipulation count overflow")?;

        if total_manipulations > MANIPULATION_THRESHOLD * 3 {
            msg!("Critical: High manipulation attempts detected: {}", total_manipulations);
            self.circuit_breaker_triggered = true;
        }

        // Validate timestamp
        let current_time = Clock::get()?.unix_timestamp;
        if self.timestamp > current_time {
            return Err(GovernanceError::InvalidMetrics)
                .with_context("Metrics Validation", "Future timestamp detected");
        }

        Ok(())
    }

    pub fn record_exploit_attempt(&mut self, attack_type: &str, attacker: Pubkey) -> Result<()> {
        let count = self.exploit_attempts
            .entry(attack_type.to_string())
            .or_insert(0);
            
        *count = count
            .checked_add(1)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Exploit Recording", "Failed to increment exploit count")?;
            
        self.unique_attackers.insert(attacker);
        self.anomaly_count = self.anomaly_count
            .checked_add(1)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Exploit Recording", "Failed to increment anomaly count")?;
            
        self.last_breach_attempt = Some(Clock::get()?.unix_timestamp);
        
        // Record high risk operation
        self.high_risk_operations.push(RiskOperation {
            timestamp: Clock::get()?.unix_timestamp,
            operation_type: attack_type.to_string(),
            risk_level: AlertLevel::Critical,
            affected_accounts: vec![attacker],
            transaction_signature: None,
        });
        
        Ok(())
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

#[derive(Debug, Default, Clone)]
pub struct MetricsView {
    pub active_proposals: u64,
    pub execution_success_rate: f64,
    pub failed_transactions: u64,
    pub treasury_stats: TreasuryStats,
    pub vote_manipulation_attempts: u64,
    pub execution_manipulation_attempts: u64,
    pub state_manipulation_attempts: u64,
    pub proposal_execution_stats: ProposalExecutionStats,
}

impl Default for MetricsView {
    fn default() -> Self {
        Self {
            active_proposals: 0,
            execution_success_rate: 0.0,
            failed_transactions: 0,
            treasury_stats: TreasuryStats::default(),
            vote_manipulation_attempts: 0,
            execution_manipulation_attempts: 0,
            state_manipulation_attempts: 0,
            proposal_execution_stats: ProposalExecutionStats::default(),
        }
    }
}

impl MetricsView {
    pub fn from_security_metrics(metrics: &SecurityMetrics) -> Self {
        Self {
            active_proposals: metrics.active_proposals,
            execution_success_rate: metrics.execution_success_rate,
            failed_transactions: metrics.failed_transactions,
            treasury_stats: metrics.treasury_operations.clone(),
            vote_manipulation_attempts: metrics.vote_manipulations,
            execution_manipulation_attempts: metrics.execution_manipulations,
            state_manipulation_attempts: metrics.state_manipulations,
            proposal_execution_stats: metrics.proposal_execution_stats.clone(),
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct ProposalExecutionStats {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub average_time: f64,
    pub max_time: i64,
    pub min_time: i64,
    pub execution_times: Vec<i64>,
}

#[derive(Debug, Default, Clone)]
pub struct TreasuryStats {
    pub total_operations: u64,
    pub successful_operations: u64,
    pub failed_operations: u64,
    pub total_volume: u64,
    pub largest_operation: u64,
    pub operation_distribution: HashMap<String, u64>,
}

#[derive(Debug, Clone)]
pub struct RiskOperation {
    pub timestamp: i64,
    pub operation_type: String,
    pub risk_level: AlertLevel,
    pub affected_accounts: Vec<Pubkey>,
    pub transaction_signature: Option<String>,
}

const FAILED_TX_THRESHOLD: u64 = 10;
const MANIPULATION_THRESHOLD: u64 = 5; 
const MANIPULATION_THRESHOLD: u64 = 5; 