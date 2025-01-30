use solana_program::pubkey::Pubkey;
use crate::state::governance_state::{GovernanceState, Proposal, ProposalCategory};
use crate::ai_assistant::groq_client::{GroqClient, BackgroundTaskManager, TaskType};

/// AI Assistant for governance interactions
pub struct GovernanceAssistant {
    governance: GovernanceState,
    groq_client: GroqClient,
    task_manager: BackgroundTaskManager,
}

impl GovernanceAssistant {
    pub async fn new(redis_url: &str, mongo_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            governance: GovernanceState::new(redis_url, mongo_url).await?,
            groq_client: GroqClient::new()?,
            task_manager: BackgroundTaskManager::new(),
        })
    }

    /// Process a user message and generate a response
    pub async fn process_message(
        &mut self,
        pubkey: &Pubkey,
        message: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        // Get current governance context
        let context = self.governance.get_ai_context(pubkey).await?;

        // Store the user's message for context
        self.governance.store_chat_context(pubkey, message).await?;

        // Get AI response
        let ai_response = self.groq_client.get_response(&context, message).await?;

        // Parse AI response for actions
        if let Some(action) = self.parse_ai_action(&ai_response) {
            match action {
                AIAction::CreateProposal { title, description } => {
                    self.handle_proposal_creation(pubkey, &title, &description).await?
                }
                AIAction::CastVote { proposal_id, vote } => {
                    self.handle_vote(pubkey, proposal_id, vote).await?
                }
                AIAction::LaunchChaosTest { campaign_id, params } => {
                    self.handle_chaos_test(campaign_id, params).await?
                }
                AIAction::RunSecurityScan { target, scan_type } => {
                    self.handle_security_scan(target, scan_type).await?
                }
            }
        }

        Ok(ai_response)
    }

    /// Parse AI response for actions
    fn parse_ai_action(&self, response: &str) -> Option<AIAction> {
        // Look for action markers in the response
        if response.contains("[ACTION:") {
            let start = response.find("[ACTION:").unwrap() + 8;
            let end = response[start..].find("]").map(|i| start + i)?;
            let action = &response[start..end];

            // Parse different action types
            if action.starts_with("CREATE_PROPOSAL:") {
                let parts: Vec<&str> = action.split('|').collect();
                if parts.len() >= 3 {
                    return Some(AIAction::CreateProposal {
                        title: parts[1].to_string(),
                        description: parts[2].to_string(),
                    });
                }
            } else if action.starts_with("CAST_VOTE:") {
                let parts: Vec<&str> = action.split('|').collect();
                if parts.len() >= 3 {
                    if let Ok(proposal_id) = parts[1].parse() {
                        return Some(AIAction::CastVote {
                            proposal_id,
                            vote: parts[2] == "yes",
                        });
                    }
                }
            } else if action.starts_with("CHAOS_TEST:") {
                let parts: Vec<&str> = action.split('|').collect();
                if parts.len() >= 3 {
                    return Some(AIAction::LaunchChaosTest {
                        campaign_id: parts[1].to_string(),
                        params: parts[2].to_string(),
                    });
                }
            } else if action.starts_with("SECURITY_SCAN:") {
                let parts: Vec<&str> = action.split('|').collect();
                if parts.len() >= 3 {
                    return Some(AIAction::RunSecurityScan {
                        target: parts[1].to_string(),
                        scan_type: parts[2].to_string(),
                    });
                }
            }
        }
        None
    }

    /// Handle proposal creation
    async fn handle_proposal_creation(
        &mut self,
        pubkey: &Pubkey,
        title: &str,
        description: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let proposal = Proposal {
            id: self.governance.metrics.active_proposals as u64 + 1,
            title: title.to_string(),
            description: description.to_string(),
            proposer: *pubkey,
            category: ProposalCategory::ProtocolParameter,
            status: crate::state::governance_state::ProposalStatus::Active,
            time_remaining: 7 * 24 * 60 * 60,
            min_stake: 5000,
            votes: crate::state::governance_state::VoteCount {
                yes: 0,
                no: 0,
                abstain: 0,
            },
            quorum_progress: 0.0,
        };

        self.governance.create_proposal(proposal.clone()).await?;

        Ok(format!(
            "Created new proposal #{}: {}\n\nDescription: {}\n\nMinimum stake required: {} GREMLINAI",
            proposal.id,
            proposal.title,
            proposal.description,
            proposal.min_stake
        ))
    }

    /// Handle vote casting
    async fn handle_vote(
        &mut self,
        pubkey: &Pubkey,
        proposal_id: u64,
        vote: bool,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let stake_amount = 5000; // Would be fetched from user's stake
        self.governance.cast_vote(proposal_id, pubkey, vote, stake_amount).await?;

        Ok(format!(
            "Vote cast for proposal #{}: {}\nStake amount: {} GREMLINAI",
            proposal_id,
            if vote { "YES" } else { "NO" },
            stake_amount
        ))
    }

    /// Handle chaos test launch
    async fn handle_chaos_test(
        &mut self,
        campaign_id: String,
        params: String,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let task_id = self.task_manager.schedule_task(TaskType::ChaosTest {
            campaign_id: campaign_id.clone(),
            test_params: params.clone(),
        }).await;

        Ok(format!(
            "Launched chaos test campaign {} with parameters: {}\nTask ID: {}",
            campaign_id,
            params,
            task_id
        ))
    }

    /// Handle security scan
    async fn handle_security_scan(
        &mut self,
        target: String,
        scan_type: String,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let task_id = self.task_manager.schedule_task(TaskType::SecurityScan {
            target: target.clone(),
            scan_type: scan_type.clone(),
        }).await;

        Ok(format!(
            "Started security scan of {} using {}\nTask ID: {}",
            target,
            scan_type,
            task_id
        ))
    }
}

/// Actions that can be triggered by AI responses
#[derive(Debug)]
enum AIAction {
    CreateProposal {
        title: String,
        description: String,
    },
    CastVote {
        proposal_id: u64,
        vote: bool,
    },
    LaunchChaosTest {
        campaign_id: String,
        params: String,
    },
    RunSecurityScan {
        target: String,
        scan_type: String,
    },
} 