use solana_program::pubkey::Pubkey;
use thiserror::Error;
use std::collections::{HashSet, HashMap};
use chrono::{DateTime, Utc};
use anchor_lang::prelude::*;
use crate::error::GovernanceError;
use super::chaos_types::{ChaosType, ResourceUsage};

#[derive(Error, Debug)]
pub enum GovernanceError {
    #[error("Quorum manipulation attempt: {0}")]
    QuorumManipulation(String),
    #[error("Treasury exploit attempt: {0}")]
    TreasuryExploit(String),
    #[error("Voting power manipulation: {0}")]
    VotingPowerManipulation(String),
    #[error("Timelock bypass attempt: {0}")]
    TimelockBypass(String),
    #[error("Proposal spam attempt: {0}")]
    ProposalSpam(String),
    #[error("Flash loan attack attempt: {0}")]
    FlashLoanAttack(String),
    #[error("Governance takeover attempt: {0}")]
    GovernanceTakeover(String),
    #[error("Instruction injection attempt: {0}")]
    InstructionInjection(String),
    #[error("Vote manipulation attempt: {0}")]
    VoteManipulation(String),
    #[error("Execution manipulation attempt: {0}")]
    ExecutionManipulation(String),
    #[error("State manipulation attempt: {0}")]
    StateManipulation(String),
    #[error("Concurrent execution attempt: {0}")]
    ConcurrentExecution(String),
}

#[derive(Debug, Clone)]
pub struct SecurityMetrics {
    pub timestamp: DateTime<Utc>,
    pub exploit_attempts: HashMap<String, u64>,
    pub unique_attackers: HashSet<Pubkey>,
    pub total_proposals: u64,
    pub total_votes: u64,
    pub treasury_operations: u64,
    pub delegations: u64,
    pub vote_manipulations: u64,
    pub execution_manipulations: u64,
    pub state_manipulations: u64,
    pub concurrent_executions: u64,
    pub proposal_execution_times: Vec<i64>,
    pub vote_distribution: HashMap<Pubkey, Vec<(DateTime<Utc>, u64)>>,
}

/// Governance-specific security checker
pub struct GovernanceChecker {
    // Known governance token mints
    trusted_mints: HashSet<Pubkey>,
    // Minimum proposal threshold
    min_proposal_threshold: u64,
    // Maximum proposals per user
    max_proposals_per_user: usize,
    // Minimum timelock period
    min_timelock_period: i64,
    // Security metrics
    metrics: SecurityMetrics,
    // Recent operations for pattern detection
    recent_operations: Vec<(DateTime<Utc>, GovernanceOperation)>,
    // Known malicious patterns
    malicious_patterns: HashSet<Vec<u8>>,
    // Rate limiting windows
    rate_limits: HashMap<Pubkey, Vec<DateTime<Utc>>>,
}

impl GovernanceChecker {
    pub fn new() -> Self {
        let mut checker = Self {
            trusted_mints: HashSet::new(),
            min_proposal_threshold: 1000,
            max_proposals_per_user: 3,
            min_timelock_period: 24 * 60 * 60,
            metrics: SecurityMetrics {
                timestamp: Utc::now(),
                exploit_attempts: HashMap::new(),
                unique_attackers: HashSet::new(),
                total_proposals: 0,
                total_votes: 0,
                treasury_operations: 0,
                delegations: 0,
                vote_manipulations: 0,
                execution_manipulations: 0,
                state_manipulations: 0,
                concurrent_executions: 0,
                proposal_execution_times: Vec::new(),
                vote_distribution: HashMap::new(),
            },
            recent_operations: Vec::new(),
            malicious_patterns: HashSet::new(),
            rate_limits: HashMap::new(),
        };
        checker.initialize_rules();
        checker
    }

    fn initialize_rules(&mut self) {
        // Add trusted governance token mints
        self.trusted_mints.insert(Pubkey::new_unique());
        
        // Initialize malicious patterns
        self.malicious_patterns.insert(vec![0xFF, 0xFF, 0xFF, 0xFF]); // Example pattern
    }

    /// Record security event
    fn record_security_event(&mut self, event_type: &str, attacker: Option<Pubkey>) {
        *self.metrics.exploit_attempts.entry(event_type.to_string()).or_insert(0) += 1;
        if let Some(pubkey) = attacker {
            self.metrics.unique_attackers.insert(pubkey);
        }
    }

    /// Check for flash loan attacks
    fn check_flash_loan(&self, token_amount: u64, recent_operations: &[(DateTime<Utc>, u64)]) -> Result<(), GovernanceError> {
        // Check for sudden large token movements
        if let Some(last_op) = recent_operations.last() {
            let time_diff = Utc::now() - last_op.0;
            if time_diff.num_seconds() < 60 && token_amount > last_op.1 * 10 {
                return Err(GovernanceError::FlashLoanAttack(
                    "Suspicious rapid token movement detected".to_string()
                ));
            }
        }
        Ok(())
    }

    /// Check for governance takeover attempts
    fn check_takeover_attempt(&self, voter: &Pubkey, vote_weight: u64, total_supply: u64) -> Result<(), GovernanceError> {
        // Check for sudden large voting power accumulation
        let voter_operations = self.recent_operations.iter()
            .filter(|(_, op)| match op {
                GovernanceOperation::CastVote { voter: v, .. } => v == voter,
                _ => false,
            })
            .count();

        if voter_operations > 5 && vote_weight > total_supply / 3 {
            return Err(GovernanceError::GovernanceTakeover(
                "Suspicious voting power accumulation".to_string()
            ));
        }
        Ok(())
    }

    /// Check for instruction injection
    fn check_instruction_injection(&self, instruction_data: &[u8]) -> Result<(), GovernanceError> {
        // Check for known malicious patterns
        for pattern in &self.malicious_patterns {
            if instruction_data.windows(pattern.len()).any(|window| window == pattern) {
                return Err(GovernanceError::InstructionInjection(
                    "Malicious instruction pattern detected".to_string()
                ));
            }
        }
        Ok(())
    }

    /// Check rate limiting
    fn check_rate_limit(&mut self, pubkey: &Pubkey, operation: &str) -> Result<(), GovernanceError> {
        let now = Utc::now();
        let window = now - chrono::Duration::minutes(5);
        
        let operations = self.rate_limits.entry(*pubkey).or_insert_with(Vec::new());
        operations.retain(|time| *time > window);
        operations.push(now);

        let limit = match operation {
            "proposal" => 3,
            "vote" => 10,
            "treasury" => 5,
            _ => 20,
        };

        if operations.len() > limit {
            return Err(GovernanceError::ProposalSpam(
                format!("Rate limit exceeded for {}", operation)
            ));
        }

        Ok(())
    }

    /// Check proposal creation parameters
    pub fn check_proposal_creation(
        &self,
        proposer: &Pubkey,
        token_amount: u64,
        active_proposals: usize,
    ) -> Result<(), GovernanceError> {
        // Check proposal threshold
        if token_amount < self.min_proposal_threshold {
            return Err(GovernanceError::VotingPowerManipulation(
                format!("Insufficient token amount: {}", token_amount)
            ));
        }

        // Check proposal spam
        if active_proposals >= self.max_proposals_per_user {
            return Err(GovernanceError::ProposalSpam(
                format!("Too many active proposals: {}", active_proposals)
            ));
        }

        Ok(())
    }

    /// Check voting parameters
    pub fn check_vote_cast(
        &self,
        voter: &Pubkey,
        token_mint: &Pubkey,
        vote_weight: u64,
        total_supply: u64,
    ) -> Result<(), GovernanceError> {
        // Verify token mint
        if !self.trusted_mints.contains(token_mint) {
            return Err(GovernanceError::VotingPowerManipulation(
                format!("Untrusted token mint: {}", token_mint)
            ));
        }

        // Check for unrealistic voting power
        if vote_weight > total_supply / 2 {
            return Err(GovernanceError::VotingPowerManipulation(
                "Vote weight exceeds 50% of total supply".to_string()
            ));
        }

        Ok(())
    }

    /// Check quorum calculation
    pub fn check_quorum(
        &self,
        total_votes: u64,
        total_supply: u64,
        quorum_percentage: u8,
    ) -> Result<(), GovernanceError> {
        // Validate quorum percentage
        if quorum_percentage == 0 || quorum_percentage > 100 {
            return Err(GovernanceError::QuorumManipulation(
                format!("Invalid quorum percentage: {}", quorum_percentage)
            ));
        }

        // Check for unrealistic vote counts
        if total_votes > total_supply {
            return Err(GovernanceError::QuorumManipulation(
                "Total votes exceed supply".to_string()
            ));
        }

        Ok(())
    }

    /// Check treasury operation
    pub fn check_treasury_operation(
        &self,
        amount: u64,
        treasury_balance: u64,
        signers: &[Pubkey],
        required_signers: usize,
    ) -> Result<(), GovernanceError> {
        // Check multi-sig requirement
        if signers.len() < required_signers {
            return Err(GovernanceError::TreasuryExploit(
                format!("Insufficient signers: {} < {}", signers.len(), required_signers)
            ));
        }

        // Check for treasury drain
        if amount > treasury_balance * 90 / 100 {
            return Err(GovernanceError::TreasuryExploit(
                "Attempt to drain >90% of treasury".to_string()
            ));
        }

        Ok(())
    }

    /// Check timelock requirements
    pub fn check_timelock(
        &self,
        proposal_time: i64,
        execution_time: i64,
    ) -> Result<(), GovernanceError> {
        let timelock_period = execution_time - proposal_time;

        if timelock_period < self.min_timelock_period {
            return Err(GovernanceError::TimelockBypass(
                format!("Timelock period too short: {} < {}", 
                    timelock_period, self.min_timelock_period
                )
            ));
        }

        Ok(())
    }

    /// Check delegate operations
    pub fn check_delegation(
        &self,
        delegator: &Pubkey,
        delegate: &Pubkey,
        token_amount: u64,
        total_delegated: u64,
    ) -> Result<(), GovernanceError> {
        // Prevent self-delegation
        if delegator == delegate {
            return Err(GovernanceError::VotingPowerManipulation(
                "Self-delegation not allowed".to_string()
            ));
        }

        // Check for delegation chains
        if total_delegated > 0 {
            return Err(GovernanceError::VotingPowerManipulation(
                "Delegate already has delegated tokens".to_string()
            ));
        }

        Ok(())
    }

    /// Check for vote manipulation patterns
    fn check_vote_manipulation(
        &self,
        voter: &Pubkey,
        vote_weight: u64,
        vote_history: &[(DateTime<Utc>, u64)],
    ) -> Result<(), GovernanceError> {
        // Check for rapid vote weight changes
        if let Some(last_vote) = vote_history.last() {
            let time_diff = Utc::now() - last_vote.0;
            if time_diff.num_seconds() < 300 && (vote_weight as f64 / last_vote.1 as f64) > 2.0 {
                return Err(GovernanceError::VoteManipulation(
                    "Suspicious rapid vote weight increase".to_string()
                ));
            }
        }

        // Check for vote splitting patterns
        let recent_votes = vote_history.iter()
            .filter(|(time, _)| (Utc::now() - *time).num_minutes() < 60)
            .count();
        if recent_votes > 5 {
            return Err(GovernanceError::VoteManipulation(
                "Suspicious vote splitting detected".to_string()
            ));
        }

        Ok(())
    }

    /// Check for execution manipulation
    fn check_execution_manipulation(
        &self,
        proposal_id: &Pubkey,
        execution_time: i64,
    ) -> Result<(), GovernanceError> {
        // Check for execution time manipulation
        let avg_execution_time = self.metrics.proposal_execution_times.iter()
            .sum::<i64>() as f64 / self.metrics.proposal_execution_times.len() as f64;
        
        if (execution_time as f64 - avg_execution_time).abs() > 3600.0 {
            return Err(GovernanceError::ExecutionManipulation(
                "Suspicious execution time deviation".to_string()
            ));
        }

        // Check for concurrent execution attempts
        let concurrent_proposals = self.recent_operations.iter()
            .filter(|(time, op)| {
                matches!(op, GovernanceOperation::ExecuteProposal { .. }) &&
                (Utc::now() - *time).num_seconds() < 60
            })
            .count();

        if concurrent_proposals > 2 {
            return Err(GovernanceError::ConcurrentExecution(
                "Too many concurrent execution attempts".to_string()
            ));
        }

        Ok(())
    }

    /// Check for state manipulation
    fn check_state_manipulation(
        &self,
        old_state: &[u8],
        new_state: &[u8],
        operation: &str,
    ) -> Result<(), GovernanceError> {
        // Check for unauthorized state changes
        let state_diff = new_state.iter()
            .zip(old_state.iter())
            .filter(|(a, b)| a != b)
            .count();

        let max_allowed_changes = match operation {
            "vote" => 2,
            "proposal" => 3,
            "execute" => 5,
            _ => 1,
        };

        if state_diff > max_allowed_changes {
            return Err(GovernanceError::StateManipulation(
                format!("Too many state changes for operation: {}", operation)
            ));
        }

        Ok(())
    }

    /// Comprehensive governance security check
    pub fn check_governance_operation(
        &self,
        operation: &GovernanceOperation,
    ) -> Result<(), GovernanceError> {
        match operation {
            GovernanceOperation::CreateProposal { proposer, token_amount, active_proposals } => {
                self.check_proposal_creation(proposer, *token_amount, *active_proposals)?;
            }
            GovernanceOperation::CastVote { voter, token_mint, vote_weight, total_supply } => {
                self.check_vote_cast(voter, token_mint, *vote_weight, *total_supply)?;
            }
            GovernanceOperation::ExecuteProposal { proposal_time, execution_time, .. } => {
                self.check_timelock(*proposal_time, *execution_time)?;
            }
            GovernanceOperation::TreasuryTransfer { amount, balance, signers, required_signers } => {
                self.check_treasury_operation(*amount, *balance, signers, *required_signers)?;
            }
        }
        Ok(())
    }

    /// Get current security metrics
    pub fn get_metrics(&self) -> SecurityMetrics {
        self.metrics.clone()
    }

    /// Update metrics for RRD graphs
    pub fn update_metrics(&mut self) {
        self.metrics.timestamp = Utc::now();
        
        // Clean up old operations
        let cutoff = Utc::now() - chrono::Duration::hours(24);
        self.recent_operations.retain(|(time, _)| *time > cutoff);
        
        // Update operation counts
        self.metrics.total_proposals = self.recent_operations.iter()
            .filter(|(_, op)| matches!(op, GovernanceOperation::CreateProposal { .. }))
            .count() as u64;
            
        self.metrics.total_votes = self.recent_operations.iter()
            .filter(|(_, op)| matches!(op, GovernanceOperation::CastVote { .. }))
            .count() as u64;
    }

    /// Enhanced check_vote_cast with new security checks
    pub fn check_vote_cast(
        &mut self,
        voter: &Pubkey,
        token_mint: &Pubkey,
        vote_weight: u64,
        total_supply: u64,
    ) -> Result<(), GovernanceError> {
        // Existing checks
        self.check_vote_cast(voter, token_mint, vote_weight, total_supply)?;

        // Additional vote manipulation checks
        let vote_history = self.metrics.vote_distribution
            .entry(*voter)
            .or_insert_with(Vec::new);
        
        self.check_vote_manipulation(voter, vote_weight, vote_history)?;
        
        // Update vote history
        vote_history.push((Utc::now(), vote_weight));
        vote_history.retain(|(time, _)| *time > Utc::now() - chrono::Duration::hours(24));

        Ok(())
    }

    /// Enhanced check_proposal_execution with new security checks
    pub fn check_proposal_execution(
        &mut self,
        proposal_id: &Pubkey,
        execution_time: i64,
        old_state: &[u8],
        new_state: &[u8],
    ) -> Result<(), GovernanceError> {
        self.check_execution_manipulation(proposal_id, execution_time)?;
        self.check_state_manipulation(old_state, new_state, "execute")?;

        // Update execution metrics
        self.metrics.proposal_execution_times.push(execution_time);
        self.metrics.proposal_execution_times.retain(|&time| 
            time > Utc::now().timestamp() - 24 * 3600
        );

        Ok(())
    }
}

/// Represents a governance operation
#[derive(Debug)]
pub enum GovernanceOperation {
    CreateProposal {
        proposer: Pubkey,
        token_amount: u64,
        active_proposals: usize,
    },
    CastVote {
        voter: Pubkey,
        token_mint: Pubkey,
        vote_weight: u64,
        total_supply: u64,
    },
    ExecuteProposal {
        proposal_time: i64,
        execution_time: i64,
        quorum_percentage: u8,
    },
    TreasuryTransfer {
        amount: u64,
        balance: u64,
        signers: Vec<Pubkey>,
        required_signers: usize,
    },
}

pub struct GovernanceSecurityChecker {
    recent_proposals: HashSet<Pubkey>,
    recent_votes: HashSet<(Pubkey, Pubkey)>, // (voter, proposal)
    blocked_addresses: HashSet<Pubkey>,
    last_check_timestamp: i64,
}

impl GovernanceSecurityChecker {
    pub fn new() -> Self {
        Self {
            recent_proposals: HashSet::new(),
            recent_votes: HashSet::new(),
            blocked_addresses: HashSet::new(),
            last_check_timestamp: 0,
        }
    }

    pub fn check_proposal_security(
        &mut self,
        proposer: &Pubkey,
        chaos_type: &ChaosType,
        clock: &Clock,
    ) -> Result<()> {
        // Rate limiting
        self.clean_old_records(clock.unix_timestamp);
        
        require!(
            !self.blocked_addresses.contains(proposer),
            GovernanceError::GovernanceTakeover
        );

        require!(
            !self.recent_proposals.contains(proposer),
            GovernanceError::ProposalSpam
        );

        // Check for specific attack patterns
        match chaos_type {
            ChaosType::FlashLoanProbe { .. } => {
                self.check_flash_loan_attack(chaos_type)?;
            },
            ChaosType::QuorumManipulation { .. } => {
                self.check_quorum_manipulation(chaos_type)?;
            },
            ChaosType::TimelockBypass { .. } => {
                self.check_timelock_bypass(chaos_type, clock)?;
            },
            _ => {},
        }

        // Record the proposal
        self.recent_proposals.insert(*proposer);
        self.last_check_timestamp = clock.unix_timestamp;

        Ok(())
    }

    fn check_flash_loan_attack(&self, chaos_type: &ChaosType) -> Result<()> {
        if let ChaosType::FlashLoanProbe { amount, token_mint } = chaos_type {
            // Check for suspicious token movement patterns
            let threshold = 1_000_000; // 1M tokens
            
            if *amount > threshold {
                msg!("Large token movement detected: {} tokens", amount);
                return Err(GovernanceError::FlashLoanAttack(
                    "Token amount exceeds flash loan threshold".to_string()
                ));
            }

            // Check for rapid token mint interactions
            if self.recent_proposals.iter().any(|p| {
                if let ChaosType::FlashLoanProbe { token_mint: recent_mint, .. } = chaos_type {
                    recent_mint == token_mint
                } else {
                    false
                }
            }) {
                return Err(GovernanceError::FlashLoanAttack(
                    "Multiple flash loan attempts on same token mint".to_string()
                ));
            }

            // Verify token mint is not blacklisted
            if self.blocked_addresses.contains(token_mint) {
                return Err(GovernanceError::FlashLoanAttack(
                    "Token mint is blacklisted".to_string()
                ));
            }
        }
        Ok(())
    }

    fn check_quorum_manipulation(&self, chaos_type: &ChaosType) -> Result<()> {
        if let ChaosType::QuorumManipulation { target_percentage, stake_simulation } = chaos_type {
            // Check for suspicious voting patterns
            let total_recent_votes = self.recent_votes.len() as u64;
            let unique_voters = self.recent_votes.iter()
                .map(|(voter, _)| voter)
                .collect::<HashSet<_>>()
                .len() as u64;

            // Detect potential sybil attacks
            if total_recent_votes > 0 && unique_voters < total_recent_votes / 3 {
                return Err(GovernanceError::QuorumManipulation(
                    "Suspicious voting pattern detected: low unique voter ratio".to_string()
                ));
            }

            // Check for rapid stake changes
            if *stake_simulation > 1_000_000 { // 1M tokens
                return Err(GovernanceError::QuorumManipulation(
                    "Large stake change detected".to_string()
                ));
            }

            // Verify target percentage is reasonable
            if *target_percentage > 75 {
                return Err(GovernanceError::QuorumManipulation(
                    "Suspicious quorum target percentage".to_string()
                ));
            }
        }
        Ok(())
    }

    fn check_timelock_bypass(&self, chaos_type: &ChaosType, clock: &Clock) -> Result<()> {
        if let ChaosType::TimelockBypass { target_timelock, attempts } = chaos_type {
            // Check for minimum timelock duration
            let min_timelock = 3600; // 1 hour
            if *target_timelock < min_timelock {
                return Err(GovernanceError::TimelockBypass(
                    "Timelock duration too short".to_string()
                ));
            }

            // Check for suspicious repeated attempts
            if *attempts > 3 {
                return Err(GovernanceError::TimelockBypass(
                    "Too many timelock bypass attempts".to_string()
                ));
            }

            // Track historical timelock patterns
            let recent_timelock_attempts = self.recent_proposals.iter()
                .filter(|_| true) // Replace with actual timelock attempt check
                .count();

            if recent_timelock_attempts > 5 {
                return Err(GovernanceError::TimelockBypass(
                    "Too many recent timelock operations".to_string()
                ));
            }

            // Check for suspicious timing patterns
            let current_time = clock.unix_timestamp;
            if current_time - self.last_check_timestamp < min_timelock {
                return Err(GovernanceError::TimelockBypass(
                    "Suspicious timing pattern detected".to_string()
                ));
            }
        }
        Ok(())
    }

    fn clean_old_records(&mut self, current_timestamp: i64) {
        if current_timestamp - self.last_check_timestamp > 3600 {
            self.recent_proposals.clear();
            self.recent_votes.clear();
            self.last_check_timestamp = current_timestamp;
        }
    }
}

#[derive(Debug, Clone)]
pub enum SecurityEventType {
    FlashLoanAttempt { amount: u64, token_mint: Pubkey },
    QuorumChange { old_percentage: u8, new_percentage: u8 },
    TimelockModification { old_timelock: i64, new_timelock: i64 },
    RapidVoting { num_votes: u32, time_window: i64 },
    MultipleProposals { proposer: Pubkey, count: u32 },
}

#[derive(Debug, Clone)]
pub enum SecurityEventSeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl SecurityEventSeverity {
    fn calculate_severity(event_type: &SecurityEventType) -> Self {
        match event_type {
            SecurityEventType::FlashLoanAttempt { amount, .. } => {
                if *amount > 10_000_000 {
                    SecurityEventSeverity::Critical
                } else if *amount > 1_000_000 {
                    SecurityEventSeverity::High
                } else {
                    SecurityEventSeverity::Medium
                }
            },
            SecurityEventType::QuorumChange { old_percentage, new_percentage } => {
                let change = new_percentage.abs_diff(*old_percentage);
                if change > 30 {
                    SecurityEventSeverity::Critical
                } else if change > 15 {
                    SecurityEventSeverity::High
                } else {
                    SecurityEventSeverity::Medium
                }
            },
            // Add other pattern matching for different event types
            _ => SecurityEventSeverity::Low,
        }
    }
} 