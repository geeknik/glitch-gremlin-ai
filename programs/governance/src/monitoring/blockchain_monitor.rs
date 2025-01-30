use anchor_lang::prelude::*;
use std::collections::HashMap;
use crate::state::*;
use super::SecurityMetrics;

pub struct BlockchainMonitor {
    last_processed_slot: u64,
    event_cache: HashMap<Pubkey, GovernanceEvent>,
}

impl BlockchainMonitor {
    pub fn new() -> Self {
        Self {
            last_processed_slot: 0,
            event_cache: HashMap::new(),
        }
    }

    pub async fn get_new_events(&self) -> Result<Vec<GovernanceEvent>> {
        // Implementation for fetching new events
        Ok(vec![])
    }

    pub async fn get_security_metrics(&self) -> Result<SecurityMetrics> {
        // Implementation for getting security metrics
        Ok(SecurityMetrics::default())
    }
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