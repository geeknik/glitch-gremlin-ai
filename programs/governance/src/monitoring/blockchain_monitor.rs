use anchor_lang::prelude::*;
use solana_client::rpc_client::RpcClient;
use solana_program::pubkey::Pubkey;
use std::collections::HashMap;
use crate::state::*;
use super::SecurityMetrics;
use crate::error::{GovernanceError, Result, ErrorContext};
use crate::state::{StakeAccount, StakeOperation, StakeOperationType};

pub const HIGH_COST_THRESHOLD: u64 = 100_000; // 0.0001 SOL
pub const ANOMALY_THRESHOLD: u64 = 1_000_000; // 0.001 SOL
pub const CONCURRENT_TX_THRESHOLD: u64 = 100;
pub const TIME_WINDOW: i64 = 300; // 5 minutes
pub const STAKE_CONCENTRATION_THRESHOLD: f64 = 0.33; // 33%

pub struct BlockchainMonitor {
    pub program_id: Pubkey,
    pub transaction_count: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
    pub last_activity: i64,
}

#[derive(Debug)]
pub struct TransactionRecord {
    pub signature: String,
    pub timestamp: i64,
    pub cost: u64,
    pub success: bool,
}

#[derive(Debug)]
pub struct StakeSnapshot {
    pub timestamp: i64,
    pub total_stake: u64,
    pub stake_distribution: HashMap<Pubkey, u64>,
    pub total_voting_power: u64,
    pub locked_stake: u64,
    pub delegated_stake: u64,
}

#[derive(Debug)]
pub struct ProgramMonitor {
    pub program_id: Pubkey,
    pub transaction_count: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
    pub last_activity: i64,
}

impl BlockchainMonitor {
    pub fn new(program_id: Pubkey) -> Self {
        Self {
            program_id,
            transaction_count: 0,
            error_count: 0,
            last_error: None,
            last_activity: 0,
        }
    }

    pub async fn get_total_transactions(&self, rpc_client: &RpcClient) -> Result<u64> {
        let signatures = rpc_client.get_signatures_for_address(&self.program_id)
            .map_err(|_| GovernanceError::ClientError)?;
        Ok(signatures.len() as u64)
    }

    pub async fn get_high_cost_transactions(&self, rpc_client: &RpcClient) -> Result<u64> {
        let signatures = rpc_client.get_signatures_for_address(&self.program_id)
            .map_err(|_| GovernanceError::ClientError)?;
        
        let mut count = 0;
        for sig_info in signatures {
            if let Ok(tx) = rpc_client.get_transaction(&sig_info.signature, None) {
                if let Some(meta) = tx.meta {
                    if meta.fee >= HIGH_COST_THRESHOLD {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    pub async fn get_failed_transactions(&self, rpc_client: &RpcClient) -> Result<u64> {
        let signatures = rpc_client.get_signatures_for_address(&self.program_id)
            .map_err(|_| GovernanceError::ClientError)?;
        
        let mut count = 0;
        for sig_info in signatures {
            if let Ok(tx) = rpc_client.get_transaction(&sig_info.signature, None) {
                if let Some(meta) = tx.meta {
                    if meta.err.is_some() {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    pub async fn detect_anomaly(&self, rpc_client: &RpcClient) -> Result<u64> {
        let signatures = rpc_client.get_signatures_for_address(&self.program_id)
            .map_err(|_| GovernanceError::ClientError)?;
        
        let current_time = Clock::get()?.unix_timestamp;
        let mut anomalies = 0;
        let mut account_activity: HashMap<Pubkey, Vec<(i64, u64)>> = HashMap::new();

        for sig_info in signatures {
            if let Some(block_time) = sig_info.block_time {
                if current_time - block_time > TIME_WINDOW {
                    continue;
                }

                if let Ok(tx) = rpc_client.get_transaction(&sig_info.signature, None) {
                    for account_key in tx.transaction.message.account_keys {
                        let activity = account_activity.entry(account_key)
                            .or_insert_with(Vec::new);
                        
                        if let Some(meta) = &tx.meta {
                            activity.push((block_time, meta.fee));
                        }
                    }
                }
            }
        }

        // Analyze patterns
        for (_, activity) in account_activity {
            if activity.len() as u64 > CONCURRENT_TX_THRESHOLD {
                anomalies += 1;
            }

            let total_cost: u64 = activity.iter().map(|(_, fee)| fee).sum();
            if total_cost > ANOMALY_THRESHOLD {
                anomalies += 1;
            }
        }

        Ok(anomalies)
    }

    pub fn record_transaction(&mut self, success: bool, error: Option<String>) -> Result<()> {
        self.transaction_count = self.transaction_count
            .checked_add(1)
            .ok_or(GovernanceError::ArithmeticOverflow)
            .with_context("Transaction Recording", "Failed to increment transaction count")?;

        if !success {
            self.error_count = self.error_count
                .checked_add(1)
                .ok_or(GovernanceError::ArithmeticOverflow)
                .with_context("Transaction Recording", "Failed to increment error count")?;
            self.last_error = error;
        }

        self.last_activity = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn clear_old_records(&mut self) {
        let current_time = Clock::get().unwrap_or_default().unix_timestamp;
        // Implementation for clearing old records
    }

    pub async fn get_new_events(&self) -> Result<Vec<GovernanceEvent>> {
        // Implementation for fetching new events
        Ok(vec![])
    }

    pub async fn get_security_metrics(&self) -> Result<SecurityMetrics> {
        // Implementation for getting security metrics
        Ok(SecurityMetrics::default())
    }

    pub async fn monitor_stake_changes(&mut self, rpc_client: &RpcClient) -> Result<Vec<Finding>> {
        let mut findings = Vec::new();
        let stake_accounts = self.get_stake_accounts(rpc_client).await?;
        let current_time = Clock::get()?.unix_timestamp;
        
        // Create new snapshot
        let mut snapshot = StakeSnapshot {
            timestamp: current_time,
            total_stake: 0,
            stake_distribution: HashMap::new(),
            total_voting_power: 0,
            locked_stake: 0,
            delegated_stake: 0,
        };

        for account in stake_accounts {
            snapshot.total_stake = snapshot.total_stake
                .checked_add(account.amount)
                .ok_or(GovernanceError::ArithmeticOverflow)
                .with_context("Failed to add total stake")?;

            snapshot.total_voting_power = snapshot.total_voting_power
                .checked_add(account.voting_power)
                .ok_or(GovernanceError::ArithmeticOverflow)
                .with_context("Failed to add voting power")?;

            if account.is_locked {
                snapshot.locked_stake = snapshot.locked_stake
                    .checked_add(account.amount)
                    .ok_or(GovernanceError::ArithmeticOverflow)
                    .with_context("Failed to add locked stake")?;
            }

            if account.is_delegated() {
                snapshot.delegated_stake = snapshot.delegated_stake
                    .checked_add(account.amount)
                    .ok_or(GovernanceError::ArithmeticOverflow)
                    .with_context("Failed to add delegated stake")?;
            }

            snapshot.stake_distribution.insert(account.owner, account.amount);
        }

        // Check for stake concentration
        for (owner, amount) in &snapshot.stake_distribution {
            let concentration = *amount as f64 / snapshot.total_stake as f64;
            if concentration > STAKE_CONCENTRATION_THRESHOLD {
                findings.push(Finding::new(
                    format!("High stake concentration detected for account {}", owner),
                    FindingSeverity::High,
                    self.program_id,
                    Some(vec![*owner]),
                    Some("Consider implementing stake limits or incentivizing stake distribution".to_string()),
                ));
            }
        }

        // Check for suspicious stake operations
        if let Some(last_snapshot) = self.stake_snapshots.last() {
            let stake_change_threshold = snapshot.total_stake / 10; // 10% change threshold

            for (owner, current_amount) in &snapshot.stake_distribution {
                if let Some(previous_amount) = last_snapshot.stake_distribution.get(owner) {
                    if current_amount.abs_diff(*previous_amount) > stake_change_threshold {
                        findings.push(Finding::new(
                            format!("Large stake change detected for account {}", owner),
                            FindingSeverity::Medium,
                            self.program_id,
                            Some(vec![*owner]),
                            Some("Monitor account for potential stake manipulation".to_string()),
                        ));
                    }
                }
            }
        }

        self.stake_snapshots.push(snapshot);
        // Keep only last 24 snapshots (assuming 5-minute intervals = 2 hours of history)
        if self.stake_snapshots.len() > 24 {
            self.stake_snapshots.remove(0);
        }

        Ok(findings)
    }

    pub async fn get_stake_accounts(&self, rpc_client: &RpcClient) -> Result<Vec<StakeAccount>> {
        let config = solana_client::rpc_config::RpcProgramAccountsConfig {
            filters: Some(vec![
                solana_client::rpc_filter::RpcFilterType::Memcmp(
                    solana_client::rpc_filter::Memcmp::new_raw_bytes(0, &[1; 8]), // StakeAccount discriminator
                ),
            ]),
            account_config: solana_client::rpc_config::RpcAccountInfoConfig {
                encoding: Some(solana_client::rpc_config::UiAccountEncoding::Base64),
                commitment: Some(CommitmentConfig::confirmed()),
                ..Default::default()
            },
            with_context: Some(true),
        };

        let accounts = rpc_client.get_program_accounts_with_config(&self.program_id, config)
            .map_err(|_| GovernanceError::ClientError)
            .with_context("Failed to fetch stake accounts")?;

        accounts.into_iter()
            .filter_map(|(_, account)| {
                if let Ok(stake_account) = StakeAccount::try_deserialize(&mut &account.data[..]) {
                    Some(stake_account)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .pipe(Ok)
    }
}

pub fn get_transaction_accounts(rpc_client: &RpcClient) -> Result<Vec<(Pubkey, Vec<u8>)>> {
    // Implementation for getting transaction accounts
    Ok(vec![])
}

pub fn get_high_cost_transaction_accounts(rpc_client: &RpcClient) -> Result<Vec<(Pubkey, Vec<u8>)>> {
    // Implementation for getting high cost transaction accounts
    Ok(vec![])
}

pub fn get_failed_transaction_accounts(rpc_client: &RpcClient) -> Result<Vec<(Pubkey, Vec<u8>)>> {
    // Implementation for getting failed transaction accounts
    Ok(vec![])
}

pub async fn detect_anomaly(rpc_client: &RpcClient) -> Result<u64> {
    // Implementation for detecting anomalies
    Ok(0)
}

#[derive(Clone)]
pub enum GovernanceEvent {
    ProposalCreated {
        proposal_id: Pubkey,
        proposer: Pubkey,
        title: String,
        description: String,
        chaos_params: ChaosParameters,
        start_time: i64,
        end_time: i64,
        execution_time: i64,
        yes_votes: u64,
        no_votes: u64,
        executed: bool,
        state: ProposalState,
        total_stake_snapshot: u64,
        unique_voters: u64,
        stake_mint: Pubkey,
    },
    VoteCast(Vote),
    ProposalExecuted {
        proposal_id: Pubkey,
        success: bool,
        timestamp: i64,
    },
    StakeChanged {
        staker: Pubkey,
        amount: u64,
        is_increase: bool,
        timestamp: i64,
    },
    EmergencyAction {
        action: EmergencyActionType,
        authority: Pubkey,
        timestamp: i64,
    },
}

impl GovernanceEvent {
    pub fn as_proposal(&self) -> Option<Proposal> {
        match self {
            GovernanceEvent::ProposalCreated {
                proposal_id,
                proposer,
                title,
                description,
                chaos_params,
                start_time,
                end_time,
                execution_time,
                yes_votes,
                no_votes,
                executed,
                state,
                total_stake_snapshot,
                unique_voters,
                stake_mint,
            } => Some(Proposal {
                proposer: *proposer,
                title: title.clone(),
                description: description.clone(),
                chaos_params: chaos_params.clone(),
                start_time: *start_time,
                end_time: *end_time,
                execution_time: *execution_time,
                yes_votes: *yes_votes,
                no_votes: *no_votes,
                executed: *executed,
                state: state.clone(),
                total_stake_snapshot: *total_stake_snapshot,
                unique_voters: *unique_voters,
                stake_mint: *stake_mint,
            }),
            _ => None,
        }
    }

    pub fn timestamp(&self) -> i64 {
        match self {
            GovernanceEvent::ProposalCreated { start_time, .. } => *start_time,
            GovernanceEvent::VoteCast(vote) => vote.timestamp,
            GovernanceEvent::ProposalExecuted { timestamp, .. } => *timestamp,
            GovernanceEvent::StakeChanged { timestamp, .. } => *timestamp,
            GovernanceEvent::EmergencyAction { timestamp, .. } => *timestamp,
        }
    }
} 