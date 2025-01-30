use solana_program::pubkey::Pubkey;
use crate::monitoring::dashboard::{SecurityStatus, AlertLevel};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use anchor_lang::prelude::*;
use crate::state::*;
use reqwest::Client;
use serde_json::json;
use std::env;
use crate::error::{GovernanceError, Result, WithErrorContext};
use super::{SecurityMetrics, RiskOperation};
use super::storage::SecurityStorage;

/// Automated security response actions
#[derive(Debug, Clone)]
pub enum SecurityAction {
    BlockAddress {
        program_id: Pubkey,
        address: Pubkey,
    },
    EnableDefenseMode {
        program_id: Pubkey,
        level: u8,
    },
    AdjustVoteValidation {
        program_id: Pubkey,
        min_stake: u64,
        max_votes_per_user: u32,
        time_window: i64,
    },
    ModifyProposalRules {
        program_id: Pubkey,
        min_stake: u64,
        max_duration: i64,
        cooldown_period: i64,
    },
    BlacklistPattern {
        program_id: Pubkey,
        pattern: Vec<u8>,
    },
    EmergencyHalt {
        program_id: Pubkey,
    },
    UpdateSecurityParams {
        program_id: Pubkey,
        params: SecurityParams,
    },
    NotifyAdmins {
        message: String,
    },
    UpdateRateLimits {
        program_id: Pubkey,
        min_stake: u64,
        max_votes_per_user: u32,
        time_window: i64,
    },
    UpdateExecutionLimits {
        program_id: Pubkey,
        min_stake: u64,
        max_duration: i64,
        cooldown_period: i64,
    },
    UpdateAuthority {
        program_id: Pubkey,
        new_authority: Pubkey,
    },
}

#[derive(Debug, Clone)]
pub struct SecurityParams {
    pub max_failed_txs: u64,
    pub max_vote_manipulations: u64,
    pub rate_limit_window: i64,
    pub max_proposals_per_window: u32,
}

impl AutoResponseHandler {
    pub fn get_program_id(&self, action: &SecurityAction) -> Pubkey {
        match action {
            SecurityAction::BlockAddress { program_id, .. } => *program_id,
            SecurityAction::EnableDefenseMode { program_id, .. } => *program_id,
            SecurityAction::AdjustVoteValidation { program_id, .. } => *program_id,
            SecurityAction::ModifyProposalRules { program_id, .. } => *program_id,
            SecurityAction::BlacklistPattern { program_id, .. } => *program_id,
            SecurityAction::EmergencyHalt { program_id } => *program_id,
            SecurityAction::UpdateSecurityParams { program_id, .. } => *program_id,
            SecurityAction::NotifyAdmins { .. } => *program_id,
            SecurityAction::UpdateRateLimits { program_id, .. } => *program_id,
            SecurityAction::UpdateExecutionLimits { program_id, .. } => *program_id,
            SecurityAction::UpdateAuthority { program_id, .. } => *program_id,
        }
    }

    pub async fn handle_action(&self, action: SecurityAction) -> Result<()> {
        match action {
            SecurityAction::EmergencyHalt { program_id } => {
                self.emergency_halt(program_id).await
            }
            SecurityAction::UpdateRateLimits { 
                program_id,
                min_stake,
                max_votes_per_user,
                time_window,
            } => {
                self.update_rate_limits(
                    program_id,
                    min_stake,
                    max_votes_per_user,
                    time_window,
                ).await
            }
            SecurityAction::UpdateExecutionLimits {
                program_id,
                min_stake,
                max_duration,
                cooldown_period,
            } => {
                self.update_execution_limits(
                    program_id,
                    min_stake,
                    max_duration,
                    cooldown_period,
                ).await
            }
            SecurityAction::BlacklistPattern { program_id, pattern } => {
                self.add_blacklist_pattern(program_id, pattern).await
            }
            SecurityAction::UpdateAuthority { program_id, new_authority } => {
                self.update_authority(new_authority).await
            }
            _ => Ok(()),
        }
    }

    pub async fn execute_actions(&self, actions: Vec<SecurityAction>) -> Result<()> {
        for action in actions {
            if let Err(e) = self.handle_action(action).await {
                msg!("Failed to execute action: {}", e);
            }
        }
        Ok(())
    }

    async fn emergency_halt(&self, program_id: Pubkey) -> Result<()> {
        msg!("Executing emergency halt");
        Ok(())
    }

    async fn update_security_parameters(&self, program_id: Pubkey, params: SecurityParams) -> Result<()> {
        msg!("Updating security parameters");
        Ok(())
    }

    async fn add_blacklist_pattern(&self, program_id: Pubkey, pattern: Vec<u8>) -> Result<()> {
        msg!("Adding blacklist pattern");
        Ok(())
    }

    async fn update_authority(&self, authority: Pubkey) -> Result<()> {
        msg!("Updating authority");
        Ok(())
    }

    async fn update_rate_limits(
        &self,
        program_id: Pubkey,
        min_stake: u64,
        max_votes_per_user: u32,
        time_window: i64,
    ) -> Result<()> {
        msg!("Updating rate limits");
        Ok(())
    }

    async fn update_execution_limits(
        &self,
        program_id: Pubkey,
        min_stake: u64,
        max_duration: i64,
        cooldown_period: i64,
    ) -> Result<()> {
        msg!("Updating execution limits");
        Ok(())
    }
}

/// Response configuration
#[derive(Debug, Default)]
pub struct ResponseConfig {
    pub auto_block_threshold: u32,
    pub rate_limit_increase_threshold: u32,
    pub emergency_halt_threshold: u32,
    pub admin_notification_threshold: u32,
    pub notification_endpoints: Vec<String>,
    pub max_actions_per_hour: u32,
    pub min_severity_threshold: u32,
    pub auto_halt_enabled: bool,
    pub auto_resume_enabled: bool,
}

/// Automated security response system
pub struct AutoResponse {
    pub blacklist_patterns: Vec<String>,
    pub rate_limits: HashMap<Pubkey, RateLimit>,
    pub execution_limits: HashMap<Pubkey, ExecutionLimit>,
    pub authority: Pubkey,
    http_client: Client,
    storage: SecurityStorage,
    webhook_url: String,
}

#[derive(Debug)]
pub struct RateLimit {
    pub min_stake: u64,
    pub max_votes_per_user: u32,
    pub time_window: i64,
}

#[derive(Debug)]
pub struct ExecutionLimit {
    pub min_stake: u64,
    pub max_duration: i64,
    pub cooldown_period: i64,
}

impl AutoResponse {
    pub async fn new() -> Result<Self> {
        let webhook_url = env::var("ALERT_WEBHOOK_URL")
            .map_err(|_| GovernanceError::ConfigError)
            .with_context("AutoResponse", "Failed to get webhook URL from environment")?;

        Ok(Self {
            blacklist_patterns: Vec::new(),
            rate_limits: HashMap::new(),
            execution_limits: HashMap::new(),
            authority: Pubkey::default(),
            http_client: Client::new(),
            storage: SecurityStorage::new().await?,
            webhook_url,
        })
    }

    pub async fn add_blacklist_pattern(&mut self, program_id: &Pubkey, pattern: String) -> Result<()> {
        require!(self.is_authorized(program_id), ErrorCode::Unauthorized);
        self.blacklist_patterns.push(pattern);
        Ok(())
    }

    pub async fn update_security_parameters(
        &mut self,
        program_id: &Pubkey,
        params: SecurityParameters
    ) -> Result<()> {
        require!(self.is_authorized(program_id), ErrorCode::Unauthorized);
        // Implementation will be added based on SecurityParameters struct
        Ok(())
    }

    pub async fn update_rate_limits(
        &mut self,
        program_id: &Pubkey,
        min_stake: u64,
        max_votes_per_user: u32,
        time_window: i64,
    ) -> Result<()> {
        require!(self.is_authorized(program_id), ErrorCode::Unauthorized);
        self.rate_limits.insert(
            *program_id,
            RateLimit {
                min_stake,
                max_votes_per_user,
                time_window,
            },
        );
        Ok(())
    }

    pub async fn update_execution_limits(
        &mut self,
        program_id: &Pubkey,
        min_stake: u64,
        max_duration: i64,
        cooldown_period: i64,
    ) -> Result<()> {
        require!(self.is_authorized(program_id), ErrorCode::Unauthorized);
        self.execution_limits.insert(
            *program_id,
            ExecutionLimit {
                min_stake,
                max_duration,
                cooldown_period,
            },
        );
        Ok(())
    }

    pub async fn update_authority(&mut self, new_authority: Pubkey) -> Result<()> {
        require!(self.is_authorized(&self.authority), ErrorCode::Unauthorized);
        self.authority = new_authority;
        Ok(())
    }

    fn is_authorized(&self, program_id: &Pubkey) -> bool {
        *program_id == self.authority
    }

    pub async fn process_security_event(&mut self, event: SecurityEvent) -> Result<()> {
        match event {
            SecurityEvent::BlacklistPattern { program_id, pattern } => {
                self.add_blacklist_pattern(&program_id, pattern).await?;
            }
            SecurityEvent::UpdateSecurityParams { program_id, params } => {
                self.update_security_parameters(&program_id, params).await?;
            }
            SecurityEvent::UpdateRateLimits { program_id, min_stake, max_votes_per_user, time_window } => {
                self.update_rate_limits(&program_id, min_stake, max_votes_per_user, time_window).await?;
            }
            SecurityEvent::UpdateExecutionLimits { program_id, min_stake, max_duration, cooldown_period } => {
                self.update_execution_limits(&program_id, min_stake, max_duration, cooldown_period).await?;
            }
            SecurityEvent::UpdateAuthority { new_authority } => {
                self.update_authority(new_authority).await?;
            }
        }
        Ok(())
    }

    pub async fn handle_security_event(
        &self,
        event_type: &str,
        severity: AlertLevel,
        program_id: &Pubkey,
        metrics: &SecurityMetrics,
        details: String,
    ) -> Result<Vec<ResponseAction>> {
        let mut actions = Vec::new();

        // Store the event
        self.storage.store_security_event(
            event_type,
            severity,
            program_id,
            mongodb::bson::doc! {
                "details": details.clone(),
                "timestamp": Clock::get()?.unix_timestamp,
            },
            metrics,
        ).await?;

        // Determine response actions based on severity and metrics
        match severity {
            AlertLevel::Critical => {
                actions.push(ResponseAction::NotifyTeam);
                actions.push(ResponseAction::CircuitBreaker);
                
                // Send immediate alert
                self.send_alert(
                    "CRITICAL SECURITY EVENT",
                    &format!("Program: {}\nType: {}\nDetails: {}", program_id, event_type, details),
                    &severity,
                ).await?;
            },
            AlertLevel::High => {
                actions.push(ResponseAction::NotifyTeam);
                
                if metrics.anomaly_count > 10 {
                    actions.push(ResponseAction::RateLimit);
                }
                
                self.send_alert(
                    "HIGH SEVERITY SECURITY EVENT",
                    &format!("Program: {}\nType: {}\nDetails: {}", program_id, event_type, details),
                    &severity,
                ).await?;
            },
            AlertLevel::Medium => {
                if metrics.anomaly_count > 5 {
                    actions.push(ResponseAction::NotifyTeam);
                }
                actions.push(ResponseAction::LogOnly);
            },
            _ => {
                actions.push(ResponseAction::LogOnly);
            }
        }

        // Record risk operation if needed
        if matches!(severity, AlertLevel::Critical | AlertLevel::High) {
            self.storage.store_risk_operation(&RiskOperation {
                timestamp: Clock::get()?.unix_timestamp,
                operation_type: event_type.to_string(),
                risk_level: severity,
                affected_accounts: vec![*program_id],
                transaction_signature: None,
            }).await?;
        }

        Ok(actions)
    }

    async fn send_alert(
        &self,
        title: &str,
        message: &str,
        severity: &AlertLevel,
    ) -> Result<()> {
        let color = match severity {
            AlertLevel::Critical => 0xFF0000, // Red
            AlertLevel::High => 0xFFA500,     // Orange
            AlertLevel::Medium => 0xFFFF00,   // Yellow
            _ => 0x00FF00,                    // Green
        };

        let payload = json!({
            "embeds": [{
                "title": title,
                "description": message,
                "color": color,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "footer": {
                    "text": format!("Severity: {:?}", severity)
                }
            }]
        });

        self.http_client
            .post(&self.webhook_url)
            .json(&payload)
            .send()
            .await
            .map_err(|_| GovernanceError::AlertError)
            .with_context("AutoResponse", "Failed to send alert")?;

        Ok(())
    }

    pub async fn check_and_respond_to_anomalies(
        &self,
        program_id: &Pubkey,
        metrics: &SecurityMetrics,
    ) -> Result<()> {
        // Check for anomalies that require response
        if metrics.circuit_breaker_triggered {
            self.handle_security_event(
                "circuit_breaker_triggered",
                AlertLevel::Critical,
                program_id,
                metrics,
                "Circuit breaker triggered due to security threshold breach".to_string(),
            ).await?;
        }

        if metrics.anomaly_count > 10 {
            self.handle_security_event(
                "high_anomaly_count",
                AlertLevel::High,
                program_id,
                metrics,
                format!("High anomaly count detected: {}", metrics.anomaly_count),
            ).await?;
        }

        // Check for suspicious manipulation patterns
        let total_manipulations = metrics.vote_manipulations
            .checked_add(metrics.execution_manipulations)
            .and_then(|sum| sum.checked_add(metrics.state_manipulations))
            .ok_or(GovernanceError::ArithmeticOverflow)?;

        if total_manipulations > 5 {
            self.handle_security_event(
                "manipulation_attempts",
                AlertLevel::High,
                program_id,
                metrics,
                format!("Multiple manipulation attempts detected: {}", total_manipulations),
            ).await?;
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum SecurityEvent {
    BlacklistPattern {
        program_id: Pubkey,
        pattern: String,
    },
    UpdateSecurityParams {
        program_id: Pubkey,
        params: SecurityParameters,
    },
    UpdateRateLimits {
        program_id: Pubkey,
        min_stake: u64,
        max_votes_per_user: u32,
        time_window: i64,
    },
    UpdateExecutionLimits {
        program_id: Pubkey,
        min_stake: u64,
        max_duration: i64,
        cooldown_period: i64,
    },
    UpdateAuthority {
        new_authority: Pubkey,
    },
}

#[derive(Debug)]
pub struct SecurityParameters {
    // Add security parameters as needed
}

#[derive(Debug, Clone, PartialEq)]
pub struct VoteValidationThresholds {
    pub min_stake: u64,
    pub max_votes_per_user: u32,
    pub time_window: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProposalRules {
    pub min_stake: u64,
    pub max_duration: i64,
    pub cooldown_period: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DefenseLevel {
    Low,
    Medium,
    High,
    Critical,
    Enhanced,
    Strict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertLevel {
    Critical,
    High,
    Medium,
    Low,
    Normal,
}

impl Default for AlertLevel {
    fn default() -> Self {
        AlertLevel::Normal
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Finding {
    pub severity: FindingSeverity,
    pub category: FindingCategory,
    pub description: String,
    pub transaction_signature: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum FindingSeverity {
    Critical,
    High,
    Medium,
    Low,
    Informational,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum FindingCategory {
    SecurityVulnerability,
    PerformanceIssue,
    LogicError,
    DataInconsistency,
    ConcurrencyIssue,
    Other,
}

pub struct SecurityStatus {
    pub alert_level: AlertLevel,
    pub findings: Vec<Finding>,
    pub recommendations: Vec<String>,
    pub program_id: Pubkey,
    pub metrics: Option<SecurityMetrics>,
    pub health: Option<HealthCheck>,
}

impl SecurityStatus {
    pub fn new(program_id: Pubkey) -> Self {
        Self {
            alert_level: AlertLevel::Low,
            findings: Vec::new(),
            recommendations: Vec::new(),
            program_id,
            metrics: None,
            health: None,
        }
    }
}

#[derive(Debug)]
pub enum ResponseAction {
    NotifyTeam,
    CircuitBreaker,
    RateLimit,
    BlockAccount,
    LogOnly,
} 