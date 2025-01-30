use solana_program::pubkey::Pubkey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
pub struct GovernanceState {
    pub metrics: GovernanceMetrics,
    pub active_proposals: HashMap<u64, Proposal>,
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
                quorum_percentage: 15,
            },
            active_proposals: HashMap::new(),
            redis_client,
            mongo_client,
        })
    }

    /// Update governance metrics from on-chain data
    pub async fn update_metrics(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // Update Redis cache
        let mut conn = self.redis_client.get_async_connection().await?;
        
        redis::cmd("HSET")
            .arg("governance:metrics")
            .arg("total_staked").arg(self.metrics.total_staked)
            .arg("staker_count").arg(self.metrics.staker_count)
            .arg("active_proposals").arg(self.metrics.active_proposals)
            .query_async(&mut conn)
            .await?;

        // Update MongoDB for historical tracking
        let db = self.mongo_client.database("governance");
        let metrics = db.collection("metrics");
        
        metrics.insert_one(bson::to_document(&self.metrics)?, None).await?;

        Ok(())
    }

    /// Store chat context for a user
    pub async fn store_chat_context(
        &self,
        pubkey: &Pubkey,
        context: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let db = self.mongo_client.database("governance");
        let chats = db.collection("chat_contexts");
        
        let doc = doc! {
            "pubkey": pubkey.to_string(),
            "context": context,
            "timestamp": bson::DateTime::now(),
        };

        chats.insert_one(doc, None).await?;
        Ok(())
    }

    /// Get chat context for a user
    pub async fn get_chat_context(
        &self,
        pubkey: &Pubkey,
    ) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let db = self.mongo_client.database("governance");
        let chats = db.collection("chat_contexts");
        
        let filter = doc! {
            "pubkey": pubkey.to_string(),
        };

        if let Some(doc) = chats.find_one(filter, None).await? {
            Ok(doc.get_str("context").ok().map(|s| s.to_string()))
        } else {
            Ok(None)
        }
    }

    /// Create a new proposal
    pub async fn create_proposal(
        &mut self,
        proposal: Proposal,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Store in Redis for quick access
        let mut conn = self.redis_client.get_async_connection().await?;
        
        let proposal_key = format!("proposal:{}", proposal.id);
        redis::cmd("HSET")
            .arg(&proposal_key)
            .arg("title").arg(&proposal.title)
            .arg("description").arg(&proposal.description)
            .arg("proposer").arg(proposal.proposer.to_string())
            .query_async(&mut conn)
            .await?;

        // Store in MongoDB for persistence
        let db = self.mongo_client.database("governance");
        let proposals = db.collection("proposals");
        
        proposals.insert_one(bson::to_document(&proposal)?, None).await?;

        // Update local state
        self.active_proposals.insert(proposal.id, proposal);
        self.metrics.active_proposals += 1;
        self.update_metrics().await?;

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
        if let Some(proposal) = self.active_proposals.get_mut(&proposal_id) {
            // Update vote counts
            if vote {
                proposal.votes.yes += stake_amount;
            } else {
                proposal.votes.no += stake_amount;
            }

            // Store vote in Redis
            let mut conn = self.redis_client.get_async_connection().await?;
            let vote_key = format!("vote:{}:{}", proposal_id, voter);
            
            redis::cmd("HSET")
                .arg(&vote_key)
                .arg("voter").arg(voter.to_string())
                .arg("vote").arg(vote)
                .arg("stake_amount").arg(stake_amount)
                .query_async(&mut conn)
                .await?;

            // Store vote in MongoDB
            let db = self.mongo_client.database("governance");
            let votes = db.collection("votes");
            
            let doc = doc! {
                "proposal_id": proposal_id as i64,
                "voter": voter.to_string(),
                "vote": vote,
                "stake_amount": stake_amount as i64,
                "timestamp": bson::DateTime::now(),
            };

            votes.insert_one(doc, None).await?;
        }

        Ok(())
    }

    /// Get AI assistant context for a user
    pub async fn get_ai_context(
        &self,
        pubkey: &Pubkey,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let mut context = String::new();

        // Add governance metrics
        context.push_str(&format!("\nGovernance Overview:\n"));
        context.push_str(&format!("Total Staked: {} GREMLINAI\n", self.metrics.total_staked));
        context.push_str(&format!("Active Stakers: {}\n", self.metrics.staker_count));
        context.push_str(&format!("Treasury Balance: {} GREMLINAI\n", self.metrics.treasury_balance));
        context.push_str(&format!("Current APY: {}%\n", self.metrics.governance_apy));

        // Add user's voting power and proposals
        if let Some(user_context) = self.get_chat_context(pubkey).await? {
            context.push_str(&format!("\nYour Context:\n{}\n", user_context));
        }

        // Add active proposals
        context.push_str("\nActive Proposals:\n");
        for proposal in self.active_proposals.values() {
            context.push_str(&format!("- {}: {}\n", proposal.id, proposal.title));
        }

        Ok(context)
    }
} 