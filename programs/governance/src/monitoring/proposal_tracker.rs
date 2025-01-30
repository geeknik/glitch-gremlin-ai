use anchor_lang::prelude::*;
use chrono::{DateTime, Utc};
use crate::state::{Proposal, ProposalState};

pub struct ProposalTracker {
    pub proposals: Vec<Proposal>,
    pub last_update: DateTime<Utc>,
}

impl ProposalTracker {
    pub fn new() -> Self {
        Self {
            proposals: Vec::new(),
            last_update: Utc::now(),
        }
    }

    pub fn track_proposal(&mut self, proposal: Proposal) {
        self.proposals.push(proposal);
        self.last_update = Utc::now();
    }

    pub fn get_active_proposals(&self) -> Vec<&Proposal> {
        self.proposals
            .iter()
            .filter(|p| p.state == ProposalState::Active)
            .collect()
    }

    pub fn get_expired_proposals(&self) -> Vec<&Proposal> {
        let now = Utc::now().timestamp();
        self.proposals
            .iter()
            .filter(|p| {
                p.state == ProposalState::Active && 
                p.voting_ends_at < now
            })
            .collect()
    }

    pub fn get_proposal_by_id(&self, id: u64) -> Option<&Proposal> {
        self.proposals
            .iter()
            .find(|p| p.proposal_id == id)
    }
}

#[derive(Clone)]
pub struct ProposalStatus {
    pub created_at: i64,
    pub state: ProposalState,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub executed: bool,
    pub execution_time: Option<i64>,
    pub execution_success: Option<bool>,
}

#[derive(Default)]
pub struct ProposalMetrics {
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub total_yes_votes: u64,
    pub total_no_votes: u64,
    pub total_execution_time: f64,
    pub executions_counted: u64,
    pub avg_execution_time: f64,
} 