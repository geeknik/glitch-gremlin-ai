use solana_program::pubkey::Pubkey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::governance::{Proposal, ProposalStatus, ProposalAction, GovernanceParams, VoteRecord};
use anchor_lang::prelude::*;

/// Governance metrics and state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernanceMetrics {
    pub total_staked: u64,        // 8.5M in the example
    pub staker_count: u32,        // 2,456 in the example
    pub active_proposals: u32,    // 7 in the example
    pub total_proposals: u32,
    pub treasury_balance: u64,    // 2.1M in the example
    pub total_votes_cast: u64,
    pub unique_voters: u32,
    pub quorum_percentage: u8,    // 15% in the example
}

impl Default for GovernanceMetrics {
    fn default() -> Self {
        Self {
            total_staked: 0,
            staker_count: 0,
            active_proposals: 0,
            total_proposals: 0,
            treasury_balance: 0,
            total_votes_cast: 0,
            unique_voters: 0,
            quorum_percentage: 10,
        }
    }
}

/// Active proposal information
#[derive(Debug)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub action: ProposalAction,
    pub status: ProposalStatus,
    pub created_at: i64,
    pub voting_ends_at: i64,
    pub executed_at: Option<i64>,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub vote_records: HashMap<Pubkey, VoteRecord>,
    pub category: String,
    pub time_remaining: i64,
    pub min_stake: u64,
    pub votes: u64,
    pub quorum_progress: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProposalCategory {
    ProtocolParameter,
    ChaosTestCampaign,
    Treasury,
    Governance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProposalStatus {
    Active,
    Ended,
    Executed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteCount {
    pub yes: u64,
    pub no: u64,
    pub abstain: u64,
}

/// Governance state manager
#[account]
#[derive(Debug)]
pub struct GovernanceState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub params: GovernanceParams,
    pub metrics: GovernanceMetrics,
    pub proposals: HashMap<Pubkey, Proposal>,
    pub vote_records: HashMap<Pubkey, VoteRecord>,
    pub last_proposal_id: u64,
}

impl GovernanceState {
    pub fn space() -> usize {
        // Calculate space needed for the account
        8 + // discriminator
        1 + // is_initialized
        32 + // authority
        std::mem::size_of::<GovernanceParams>() +
        std::mem::size_of::<GovernanceMetrics>() +
        // Proposals and vote records are stored in separate accounts
        8 + // last_proposal_id
        256 // padding for future upgrades
    }

    pub fn new(authority: Pubkey) -> Self {
        Self {
            is_initialized: true,
            authority,
            params: GovernanceParams::default(),
            metrics: GovernanceMetrics::default(),
            proposals: HashMap::new(),
            vote_records: HashMap::new(),
            last_proposal_id: 0,
        }
    }

    pub fn update_metrics(&mut self) -> Result<()> {
        let mut metrics = GovernanceMetrics::default();

        // Update proposal counts
        metrics.total_proposals = self.proposals.len() as u32;
        metrics.active_proposals = self.proposals.values()
            .filter(|p| matches!(p.status, ProposalStatus::Active))
            .count() as u32;

        // Update vote metrics
        metrics.total_votes_cast = self.vote_records.len() as u64;
        metrics.unique_voters = self.vote_records.values()
            .map(|v| v.voter)
            .collect::<std::collections::HashSet<_>>()
            .len() as u32;

        self.metrics = metrics;
        Ok(())
    }

    /// Store chat context for a user
    pub async fn store_chat_context(
        &self,
        pubkey: &Pubkey,
        context: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.redis_client.get_async_connection().await?;
        let key = format!("chat_context:{}", pubkey.to_string());
        
        redis::cmd("SET")
            .arg(&key)
            .arg(context)
            .arg("EX")
            .arg(3600) // 1 hour expiry
            .query_async(&mut conn)
            .await?;

        Ok(())
    }

    /// Get chat context for a user
    pub async fn get_chat_context(
        &self,
        pubkey: &Pubkey,
    ) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let mut conn = self.redis_client.get_async_connection().await?;
        let key = format!("chat_context:{}", pubkey.to_string());
        
        let context: Option<String> = redis::cmd("GET")
            .arg(&key)
            .query_async(&mut conn)
            .await?;

        Ok(context)
    }

    /// Create a new proposal
    pub fn create_proposal(
        &mut self,
        proposer: Pubkey,
        title: String,
        description: String,
        action: ProposalAction,
    ) -> Result<Pubkey> {
        require!(
            self.is_initialized,
            ErrorCode::UninitializedAccount
        );

        let proposal_id = self.last_proposal_id.checked_add(1)
            .ok_or(ErrorCode::ArithmeticError)?;

        let proposal = Proposal {
            id: proposal_id,
            proposer,
            title,
            description,
            action,
            status: ProposalStatus::Draft,
            created_at: Clock::get()?.unix_timestamp,
            voting_ends_at: 0, // Set when activated
            executed_at: None,
            yes_votes: 0,
            no_votes: 0,
            vote_records: HashMap::new(),
            category: String::new(),
            time_remaining: 0,
            min_stake: 0,
            votes: 0,
            quorum_progress: 0,
        };

        let proposal_address = Pubkey::find_program_address(
            &[
                b"proposal".as_ref(),
                proposal_id.to_le_bytes().as_ref(),
            ],
            &crate::ID,
        ).0;

        self.proposals.insert(proposal_address, proposal);
        self.last_proposal_id = proposal_id;
        
        Ok(proposal_address)
    }

    /// Activate a proposal
    pub fn activate_proposal(
        &mut self,
        proposal_address: Pubkey,
    ) -> Result<()> {
        let proposal = self.proposals.get_mut(&proposal_address)
            .ok_or(ErrorCode::ProposalNotFound)?;

        require!(
            proposal.status == ProposalStatus::Draft,
            ErrorCode::InvalidProposalState
        );

        let now = Clock::get()?.unix_timestamp;
        proposal.status = ProposalStatus::Active;
        proposal.voting_ends_at = now.checked_add(self.params.voting_period)
            .ok_or(ErrorCode::ArithmeticError)?;

        self.update_metrics()?;
        Ok(())
    }

    /// Cast a vote on a proposal
    pub fn cast_vote(
        &mut self,
        proposal_address: Pubkey,
        voter: Pubkey,
        side: bool,
        voting_power: u64,
    ) -> Result<()> {
        let proposal = self.proposals.get_mut(&proposal_address)
            .ok_or(ErrorCode::ProposalNotFound)?;

        require!(
            proposal.status == ProposalStatus::Active,
            ErrorCode::InvalidProposalState
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now <= proposal.voting_ends_at,
            ErrorCode::VotingEnded
        );

        let vote_record = VoteRecord::new(
            voter,
            proposal_address,
            side,
            voting_power,
            now,
        );

        if side {
            proposal.yes_votes = proposal.yes_votes.checked_add(voting_power)
                .ok_or(ErrorCode::ArithmeticError)?;
        } else {
            proposal.no_votes = proposal.no_votes.checked_add(voting_power)
                .ok_or(ErrorCode::ArithmeticError)?;
        }

        proposal.vote_records.insert(voter, vote_record.clone());
        self.vote_records.insert(voter, vote_record);

        self.update_metrics()?;
        Ok(())
    }

    /// Get AI assistant context for a user
    pub async fn get_ai_context(
        &self,
        pubkey: &Pubkey,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let mut conn = self.redis_client.get_async_connection().await?;
        let key = format!("ai_context:{}", pubkey.to_string());
        
        let context: Option<String> = redis::cmd("GET")
            .arg(&key)
            .query_async(&mut conn)
            .await?;

        Ok(context.unwrap_or_else(|| String::from("New conversation")))
    }
} 