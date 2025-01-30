use {
    anchor_lang::prelude::*,
    std::collections::HashMap,
    crate::error::GovernanceError,
    crate::state::proposal::{Proposal, ProposalStatus, ProposalAction, VoteRecord},
    crate::state::governance::GovernanceParams,
    std::str::FromStr,
};

/// Governance metrics and state
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct GovernanceMetrics {
    pub total_stake: u64,
    pub active_stake: u64,
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub total_votes: u64,
    pub unique_voters: u64,
    pub quorum_percentage: u8,
    pub approval_threshold: u8,
    pub treasury_balance: u64,
    pub chaos_events: u64,
}

impl Default for GovernanceMetrics {
    fn default() -> Self {
        Self {
            total_stake: 0,
            active_stake: 0,
            total_proposals: 0,
            active_proposals: 0,
            total_votes: 0,
            unique_voters: 0,
            quorum_percentage: 0,
            approval_threshold: 0,
            treasury_balance: 0,
            chaos_events: 0,
        }
    }
}

/// Governance state manager
#[account]
#[derive(Debug)]
pub struct GovernanceState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub config: GovernanceParams,
    pub total_proposals: u64,
    pub total_staked: u64,
    pub treasury_balance: u64,
    pub emergency_halt_active: bool,
    pub last_proposal_time: i64,
    pub proposal_count_window: u64,
    pub total_treasury_inflow: u64,
    pub total_treasury_outflow: u64,
    pub treasury_bump: u8,
    pub treasury_auth_bump: u8,
    pub emergency_halt_bump: u8,
}

impl GovernanceState {
    pub fn space() -> usize {
        // Calculate space needed for the account
        8 + // discriminator
        1 + // is_initialized
        32 + // authority
        200 + // config (approximate)
        8 + // total_proposals
        8 + // total_staked
        8 + // treasury_balance
        1 + // emergency_halt_active
        8 + // last_proposal_time
        8 + // proposal_count_window
        8 + // total_treasury_inflow
        8 + // total_treasury_outflow
        1 + // treasury_bump
        1 + // treasury_auth_bump
        1 // emergency_halt_bump
    }

    pub fn new(authority: Pubkey) -> Self {
        Self {
            is_initialized: true,
            authority,
            config: GovernanceParams::default(),
            total_proposals: 0,
            total_staked: 0,
            treasury_balance: 0,
            emergency_halt_active: false,
            last_proposal_time: 0,
            proposal_count_window: 0,
            total_treasury_inflow: 0,
            total_treasury_outflow: 0,
            treasury_bump: 0,
            treasury_auth_bump: 0,
            emergency_halt_bump: 0,
        }
    }

    pub fn is_halted(&self) -> bool {
        self.emergency_halt_active
    }

    pub fn verify_not_halted(&self) -> Result<()> {
        require!(!self.is_halted(), GovernanceError::ProgramHalted);
        Ok(())
    }

    pub fn verify_gremlinai_token(token_mint: &Pubkey) -> Result<()> {
        require!(
            token_mint == &Pubkey::from_str(crate::GREMLINAI_TOKEN_MINT).unwrap(),
            GovernanceError::InvalidTokenMint
        );
        Ok(())
    }

    pub fn verify_dev_authority(authority: &Pubkey) -> Result<()> {
        require!(
            authority == &Pubkey::from_str(crate::DEV_WALLET).unwrap(),
            GovernanceError::UnauthorizedDeveloper
        );
        Ok(())
    }

    pub fn validate_proposal_parameters(
        &self,
        voting_period: i64,
        execution_delay: u64,
        quorum: u8,
        threshold: u8,
    ) -> Result<()> {
        require!(
            voting_period >= self.config.voting_delay && 
            voting_period <= self.config.voting_period,
            GovernanceError::InvalidVotingPeriod
        );

        require!(
            quorum >= self.config.min_stake_to_vote && quorum <= 100,
            GovernanceError::InvalidQuorum
        );

        require!(
            threshold >= self.config.min_stake_to_propose && threshold <= 100,
            GovernanceError::InvalidThreshold
        );

        Ok(())
    }

    pub fn check_proposal_rate_limit(&self, current_time: i64) -> Result<()> {
        if current_time - self.last_proposal_time <= self.config.voting_period 
            && self.proposal_count_window >= self.config.min_stake_to_propose {
            return Err(GovernanceError::ProposalRateLimitExceeded.into());
        }
        
        Ok(())
    }

    pub fn has_active_votes(&self, voter: &Pubkey) -> bool {
        // In production, implement proper vote tracking
        false
    }

    pub fn update_metrics(&mut self) -> Result<()> {
        let clock = Clock::get()?;
        
        // Update metrics only if enough time has passed
        if clock.unix_timestamp - self.last_metrics_update < 60 {
            return Ok(());
        }

        self.last_metrics_update = clock.unix_timestamp;
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
        description: String,
        link: Option<String>,
        action: ProposalAction,
        voting_ends_at: i64,
        execution_delay: u64,
    ) -> Result<Pubkey> {
        require!(self.is_initialized, GovernanceError::UninitializedAccount);

        let proposal = Proposal::new(
            proposer,
            description,
            link,
            execution_delay,
            action,
            voting_ends_at,
        );

        let proposal_address = Pubkey::find_program_address(
            &[
                b"proposal".as_ref(),
                proposal.created_at.to_le_bytes().as_ref(),
                proposer.as_ref(),
            ],
            &crate::ID,
        ).0;

        self.proposals.insert(proposal_address, proposal);
        self.metrics.total_proposals = self.metrics.total_proposals.saturating_add(1);
        
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
        vote: bool,
        stake_weight: u64,
    ) -> Result<()> {
        let proposal = self.get_proposal_mut(&proposal_address)?;

        require!(
            proposal.is_active(),
            GovernanceError::InvalidProposalState
        );

        require!(
            !proposal.votes.contains_key(&voter),
            GovernanceError::AlreadyVoted
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now <= proposal.voting_ends_at,
            GovernanceError::VotingPeriodEnded
        );

        let vote_record = VoteRecord::new(
            voter,
            vote,
            stake_weight,
            now,
        );

        if vote {
            proposal.for_votes = proposal.for_votes.checked_add(stake_weight)
                .ok_or_else(|| error!(GovernanceError::ArithmeticOverflow))?;
        } else {
            proposal.against_votes = proposal.against_votes.checked_add(stake_weight)
                .ok_or_else(|| error!(GovernanceError::ArithmeticOverflow))?;
        }

        proposal.votes.insert(voter, vote_record);
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