use solana_program::pubkey::Pubkey;
use crate::monitoring::dashboard::{SecurityStatus, AlertLevel};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use anchor_lang::prelude::*;
use crate::state::*;

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
    config: ResponseConfig,
    action_history: Vec<(DateTime<Utc>, SecurityAction)>,
    blocked_addresses: Arc<RwLock<HashMap<Pubkey, Vec<Pubkey>>>>,
    rate_limits: Arc<RwLock<HashMap<Pubkey, u32>>>,
}

impl AutoResponse {
    pub fn new(config: ResponseConfig) -> Self {
        Self {
            config,
            action_history: Vec::new(),
            blocked_addresses: Arc::new(RwLock::new(HashMap::new())),
            rate_limits: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Process security status with enhanced response actions
    pub async fn process_security_status(
        &mut self,
        status: &SecurityStatus,
    ) -> Vec<SecurityAction> {
        let mut actions = Vec::new();

        match status.alert_level {
            AlertLevel::Critical => {
                // Immediate lockdown
                actions.push(SecurityAction::EnableDefenseMode {
                    program_id: status.program_id,
                    level: 4, // Assuming Critical level is represented by level 4
                });
                
                actions.push(SecurityAction::EmergencyHalt {
                    program_id: status.program_id,
                });

                // Notify all admins with detailed report
                actions.push(SecurityAction::NotifyAdmins {
                    message: self.generate_critical_alert_message(status),
                });
            }
            AlertLevel::High => {
                if let Some(metrics) = &status.metrics {
                    // Check for vote manipulation
                    if metrics.vote_manipulations > 0 {
                        actions.push(SecurityAction::AdjustVoteValidation {
                            program_id: status.program_id,
                            min_stake: 86400, // 24 hours
                            max_votes_per_user: 0,
                            time_window: 300, // 5 minutes
                        });
                    }

                    // Check for proposal spam
                    if metrics.total_proposals > 50 {
                        actions.push(SecurityAction::ModifyProposalRules {
                            program_id: status.program_id,
                            min_stake: 86400,
                            max_duration: 7200, // 2 hours
                            cooldown_period: 3600, // 1 hour
                        });
                    }

                    // Enable enhanced defense mode
                    actions.push(SecurityAction::EnableDefenseMode {
                        program_id: status.program_id,
                        level: 3, // Assuming High level is represented by level 3
                    });
                }
            }
            AlertLevel::Medium => {
                if let Some(metrics) = &status.metrics {
                    // Adjust security parameters
                    let mut param_updates = HashMap::new();
                    
                    if metrics.total_proposals > 20 {
                        param_updates.insert("min_stake".to_string(), 5000);
                    }
                    
                    if metrics.treasury_operations > 10 {
                        param_updates.insert("treasury_operation_limit".to_string(), 5);
                    }

                    if !param_updates.is_empty() {
                        actions.push(SecurityAction::UpdateSecurityParams {
                            program_id: status.program_id,
                            params: SecurityParams {
                                max_failed_txs: 0,
                                max_vote_manipulations: 0,
                                rate_limit_window: 0,
                                max_proposals_per_window: 0,
                            },
                        });
                    }

                    // Enable strict defense mode
                    actions.push(SecurityAction::EnableDefenseMode {
                        program_id: status.program_id,
                        level: 2, // Assuming Medium level is represented by level 2
                    });
                }
            }
            _ => {
                // Monitor and log
                if status.alert_level != AlertLevel::Normal {
                    actions.push(SecurityAction::NotifyAdmins {
                        message: format!(
                            "Alert level {:?} for program {}. Additional monitoring enabled.",
                            status.alert_level,
                            status.program_id
                        ),
                    });
                }
            }
        }

        // Record actions
        let now = Utc::now();
        for action in &actions {
            self.action_history.push((now, action.clone()));
        }

        actions
    }

    /// Generate detailed message for critical alerts
    fn generate_critical_alert_message(&self, status: &SecurityStatus) -> String {
        let mut message = format!(
            "CRITICAL SECURITY ALERT for program {}\n\n",
            status.program_id
        );

        if let Some(metrics) = &status.metrics {
            message.push_str(&format!(
                "Exploit Attempts: {}\n",
                metrics.exploit_attempts.values().sum::<u64>()
            ));
            message.push_str(&format!(
                "Unique Attackers: {}\n",
                metrics.unique_attackers.len()
            ));
            message.push_str(&format!(
                "Vote Manipulations: {}\n",
                metrics.vote_manipulations
            ));
            message.push_str(&format!(
                "State Manipulations: {}\n",
                metrics.state_manipulations
            ));
        }

        if let Some(health) = &status.health {
            message.push_str(&format!(
                "\nHealth Status:\n- Responsive: {}\n- State Valid: {}\n",
                health.is_responsive,
                health.state_valid
            ));
        }

        message.push_str("\nAutomatic Actions Taken:\n- Emergency Halt\n- Defense Mode: Critical\n");
        
        message
    }

    /// Execute enhanced security actions
    pub async fn execute_actions(&mut self, actions: Vec<SecurityAction>) -> Result<()> {
        for action in actions {
            match action {
                SecurityAction::EnableDefenseMode { program_id, level } => {
                    self.enable_defense_mode(program_id, level).await?;
                }
                SecurityAction::AdjustVoteValidation { program_id, min_stake, max_votes_per_user, time_window } => {
                    self.update_vote_validation(program_id, min_stake, max_votes_per_user, time_window).await?;
                }
                SecurityAction::ModifyProposalRules { program_id, min_stake, max_duration, cooldown_period } => {
                    self.update_proposal_rules(program_id, min_stake, max_duration, cooldown_period).await?;
                }
                SecurityAction::BlacklistPattern { program_id, pattern } => {
                    self.add_blacklist_pattern(program_id, pattern).await?;
                }
                SecurityAction::BlockAddress { program_id, address } => {
                    let mut blocked = self.blocked_addresses.write().await;
                    blocked.entry(program_id)
                        .or_insert_with(Vec::new)
                        .push(address);
                }
                SecurityAction::NotifyAdmins { message } => {
                    self.send_notifications(&message).await?;
                }
                SecurityAction::EmergencyHalt { program_id } => {
                    self.halt_program().await?;
                }
                SecurityAction::UpdateSecurityParams { program_id, params } => {
                    self.update_security_parameters(program_id, params).await?;
                }
                SecurityAction::UpdateRateLimits { program_id, min_stake, max_votes_per_user, time_window } => {
                    self.update_rate_limits(program_id, min_stake, max_votes_per_user, time_window).await?;
                }
                SecurityAction::UpdateExecutionLimits { program_id, min_stake, max_duration, cooldown_period } => {
                    self.update_execution_limits(program_id, min_stake, max_duration, cooldown_period).await?;
                }
                SecurityAction::UpdateAuthority { program_id, new_authority } => {
                    self.update_authority(new_authority).await?;
                }
            }
        }

        Ok(())
    }

    /// Calculate new rate limit based on current activity
    async fn calculate_new_rate_limit(&self, program_id: Pubkey) -> u32 {
        let current_limit = self.rate_limits
            .read()
            .await
            .get(&program_id)
            .copied()
            .unwrap_or(10);

        // Increase by 50% with a maximum of 100
        std::cmp::min(current_limit + (current_limit / 2), 100)
    }

    /// Trigger emergency halt
    async fn trigger_emergency_halt(
        &self,
        program_id: Pubkey,
        reason: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Implement emergency halt logic here
        // This could involve calling a privileged instruction to pause the program
        println!("EMERGENCY HALT triggered for program {} - Reason: {}", program_id, reason);
        Ok(())
    }

    /// Send notifications to admins
    async fn send_notifications(
        &self,
        message: &str,
    ) -> Result<()> {
        msg!("Sending notification: {}", message);
        Ok(())
    }

    /// Get action history for a specific program
    pub fn get_action_history(&self, program_id: &Pubkey) -> Vec<(DateTime<Utc>, SecurityAction)> {
        self.action_history
            .iter()
            .filter(|(_, action)| match action {
                SecurityAction::BlockAddress { program_id: p, .. } |
                SecurityAction::IncreaseRateLimits { program_id: p, .. } |
                SecurityAction::EmergencyHalt { program_id: p, .. } |
                SecurityAction::UpdateSecurityParams { program_id: p, .. } => p == program_id,
                SecurityAction::NotifyAdmins { .. } => false,
            })
            .cloned()
            .collect()
    }

    /// Get blocked addresses for a program
    pub async fn get_blocked_addresses(&self, program_id: &Pubkey) -> Vec<Pubkey> {
        self.blocked_addresses
            .read()
            .await
            .get(program_id)
            .cloned()
            .unwrap_or_default()
    }

    /// Get current rate limit for a program
    pub async fn get_rate_limit(&self, program_id: &Pubkey) -> u32 {
        self.rate_limits
            .read()
            .await
            .get(program_id)
            .copied()
            .unwrap_or(10)
    }

    /// Enable defense mode for a program
    async fn enable_defense_mode(&self, program_id: Pubkey, level: u8) -> Result<()> {
        msg!("Enabling defense mode for program {} with level {}", program_id, level);
        Ok(())
    }

    /// Update vote validation thresholds
    async fn update_vote_validation(
        &self,
        program_id: Pubkey,
        min_stake: u64,
        max_votes_per_user: u32,
        time_window: i64,
    ) -> Result<()> {
        msg!("Updating vote validation thresholds");
        Ok(())
    }

    /// Update proposal rules
    async fn update_proposal_rules(
        &self,
        program_id: Pubkey,
        min_stake: u64,
        max_duration: i64,
        cooldown_period: i64,
    ) -> Result<()> {
        msg!("Updating proposal rules");
        Ok(())
    }

    async fn halt_program(&self) -> Result<()> {
        msg!("Halting program");
        Ok(())
    }

    async fn resume_program(&self) -> Result<()> {
        msg!("Resuming program");
        Ok(())
    }

    async fn update_config(&self, config: Box<GovernanceConfig>) -> Result<()> {
        msg!("Updating config");
        Ok(())
    }
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