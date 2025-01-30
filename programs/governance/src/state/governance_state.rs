use solana_program::pubkey::Pubkey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::governance::{Proposal, ProposalStatus, ProposalAction, GovernanceParams, VoteRecord};

/// Governance metrics and state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernanceMetrics {
    pub total_staked: u64,        // 8.5M in the example
    pub staker_count: u32,        // 2,456 in the example
    pub active_proposals: u32,    // 7 in the example
    pub ending_soon: u32,         // 3 in the example
    pub treasury_balance: u64,    // 2.1M in the example
    pub emergency_reserve: u64,   // 5% in the example
    pub governance_apy: f64,      // 10% in the example
    pub spooky_bonus: f64,        // +25% in the example
    pub quorum_percentage: u8,    // 15% in the example
}

/// Active proposal information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposal {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub proposer: Pubkey,
    pub category: ProposalCategory,
    pub status: ProposalStatus,
    pub time_remaining: i64,
    pub min_stake: u64,
    pub votes: VoteCount,
    pub quorum_progress: f64,
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
#[derive(Debug)]
pub struct GovernanceState {
    pub metrics: GovernanceMetrics,
    pub active_proposals: HashMap<u64, Proposal>,
    pub params: GovernanceParams,
    redis_client: redis::Client,
    mongo_client: mongodb::Client,
}

impl GovernanceState {
    pub async fn new(redis_url: &str, mongo_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let redis_client = redis::Client::open(redis_url)?;
        let mongo_client = mongodb::Client::with_uri_str(mongo_url).await?;
        
        Ok(Self {
            metrics: GovernanceMetrics {
                total_staked: 0,
                staker_count: 0,
                active_proposals: 0,
                ending_soon: 0,
                treasury_balance: 0,
                emergency_reserve: 0,
                governance_apy: 0.0,
                spooky_bonus: 0.0,
                quorum_percentage: 10,
            },
            active_proposals: HashMap::new(),
            params: GovernanceParams::default(),
            redis_client,
            mongo_client,
        })
    }

    /// Update governance metrics from on-chain data
    pub async fn update_metrics(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.redis_client.get_async_connection().await?;
        
        // Update metrics from Redis
        self.metrics.total_staked = redis::cmd("GET")
            .arg("total_staked")
            .query_async(&mut conn)
            .await
            .unwrap_or(0);

        self.metrics.staker_count = redis::cmd("GET")
            .arg("staker_count")
            .query_async(&mut conn)
            .await
            .unwrap_or(0);

        // Update proposal metrics
        let proposals_coll = self.mongo_client.database("governance").collection("proposals");
        self.metrics.active_proposals = proposals_coll
            .count_documents(doc! { "status": "Active" }, None)
            .await? as u32;

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
    pub async fn create_proposal(
        &mut self,
        proposal: Proposal,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let proposals_coll = self.mongo_client
            .database("governance")
            .collection("proposals");

        let proposal_doc = mongodb::bson::to_document(&proposal)?;
        proposals_coll.insert_one(proposal_doc, None).await?;

        // Update active proposals cache
        self.active_proposals.insert(proposal.id, proposal);
        self.metrics.active_proposals += 1;

        Ok(())
    }

    /// Cast a vote on a proposal
    pub async fn cast_vote(
        &mut self,
        proposal_id: u64,
        voter: &Pubkey,
        vote: bool,
        stake_amount: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let vote_record = VoteRecord::new(
            *voter,
            Pubkey::default(), // This should be the proposal's pubkey
            stake_amount,
            vote,
            chrono::Utc::now().timestamp(),
        );

        // Store vote in MongoDB
        let votes_coll = self.mongo_client
            .database("governance")
            .collection("votes");

        let vote_doc = mongodb::bson::to_document(&vote_record)?;
        votes_coll.insert_one(vote_doc, None).await?;

        // Update proposal vote counts
        if let Some(proposal) = self.active_proposals.get_mut(&proposal_id) {
            if vote {
                proposal.votes.yes = proposal.votes.yes.saturating_add(stake_amount);
            } else {
                proposal.votes.no = proposal.votes.no.saturating_add(stake_amount);
            }
        }

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