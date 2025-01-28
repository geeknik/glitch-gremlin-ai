use borsh::{BorshSerialize, BorshDeserialize};
use solana_program::pubkey::Pubkey;
use crate::state::{SecurityLevel, TestParams};
use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    clock::Clock,
    sysvar::Sysvar,
    msg,
};
use std::io::Write;
use std::collections::{HashMap, HashSet};

pub const MIN_PROPOSAL_DURATION: i64 = 7 * 24 * 60 * 60; // 1 week
pub const MAX_PROPOSAL_DURATION: i64 = 30 * 24 * 60 * 60; // 30 days
pub const MIN_QUORUM: u8 = 51; // 51% quorum required
pub const PROPOSAL_COOLDOWN: i64 = 24 * 60 * 60; // 24 hours between proposals

#[derive(Debug, BorshSerialize, BorshDeserialize, Clone)]
pub struct Proposal {
    /// Unique ID of the proposal
    pub id: u64,
    /// The proposer's public key
    pub proposer: Pubkey,
    /// Title of the proposal
    pub title: String,
    /// Description of the proposal
    pub description: String,
    /// Target program to test
    pub target_program: Pubkey,
    /// Amount of GLITCH tokens staked
    pub staked_amount: u64,
    /// Current vote count
    pub vote_counts: VoteCounts,
    /// Voting deadline (Unix timestamp)
    pub voting_ends_at: i64,
    /// Execution time
    pub executed_at: Option<i64>,
    /// Status of the proposal
    pub status: ProposalStatus,
    /// Escrow account for test funds
    pub escrow_account: Pubkey,
    /// Test parameters
    pub test_params: TestParams,
    /// Execution delay in seconds
    pub execution_delay: i64,
    /// Required quorum percentage
    pub quorum: u8,
    /// Security level
    pub security_level: SecurityLevel,
    /// Multisig signers
    pub multisig_signers: Vec<Pubkey>,
    /// Required signatures
    pub required_signatures: u8,
    pub created_at: i64,
    pub voting_starts_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, BorshSerialize, BorshDeserialize, Clone)]
pub struct VoteCounts {
    pub yes: u64,
    pub no: u64,
    pub abstain: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
    Cancelled,
}

impl Default for VoteCounts {
    fn default() -> Self {
        Self {
            yes: 0,
            no: 0,
            abstain: 0,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum FuzzingStrategy {
    Random,
    Guided,
    Evolutionary,
    Reinforcement
}

impl Proposal {
    pub fn new(
        id: u64,
        proposer: Pubkey,
        title: String,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        voting_duration: i64,
        test_params: TestParams,
        clock: &Clock,
    ) -> Result<Self, ProgramError> {
        if voting_duration < MIN_PROPOSAL_DURATION || voting_duration > MAX_PROPOSAL_DURATION {
            return Err(ProgramError::InvalidArgument);
        }

        #[cfg(target_os = "linux")]
        {
            // DESIGN.md 9.6.4 Memory Safety - Linux specific
            std::arch::asm!("mfence"); // Memory barrier
            std::arch::asm!("lfence"); // Speculative execution barrier
        }
        #[cfg(not(target_os = "linux"))]
        {
            // Cross-platform memory barrier
            std::sync::atomic::fence(std::sync::atomic::Ordering::SeqCst);
        }

        // Validate test parameters
        assert!(test_params.memory_fence_required, "Memory fencing must be enabled");
        assert!(test_params.entropy_checks, "Entropy checks required");
        
        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting
        let mut entropy_input = Vec::new();
        entropy_input.extend_from_slice(&id.to_le_bytes());
        entropy_input.extend_from_slice(&voting_duration.to_le_bytes());
        let entropy = solana_program::hash::hash(&entropy_input);
        
        let proposal = Self {
            id,
            proposer,
            title,
            description,
            target_program,
            staked_amount,
            vote_counts: VoteCounts::default(),
            voting_ends_at: clock.unix_timestamp + voting_duration,
            executed_at: None,
            status: ProposalStatus::Draft,
            escrow_account: Pubkey::default(),
            test_params,
            execution_delay: 3600,
            quorum: 7,
            security_level: SecurityLevel::High,
            multisig_signers: Vec::new(),
            required_signatures: 7,
            created_at: clock.unix_timestamp,
            voting_starts_at: clock.unix_timestamp,
            expires_at: clock.unix_timestamp + voting_duration,
        };

        // Verify entropy bits
        assert!(entropy.as_ref()[0] & 0xF0 == 0x90, "Invalid entropy pattern");

        Ok(proposal)
    }

    pub fn is_active(&self, clock: &Clock) -> bool {
        let current_time = clock.unix_timestamp;
        self.status == ProposalStatus::Active &&
        current_time >= self.voting_starts_at &&
        current_time <= self.voting_ends_at
    }

    pub fn cast_vote(
        &mut self,
        voter: &Pubkey,
        vote_type: VoteType,
        vote_weight: u64,
        clock: &Clock,
    ) -> Result<(), ProgramError> {
        if !self.is_active(clock) {
            return Err(ProgramError::InvalidArgument);
        }

        match vote_type {
            VoteType::Yes => self.vote_counts.yes += vote_weight,
            VoteType::No => self.vote_counts.no += vote_weight,
            VoteType::Abstain => self.vote_counts.abstain += vote_weight,
        }

        Ok(())
    }

    pub fn finalize_vote(&mut self, clock: &Clock) -> Result<(), ProgramError> {
        if !self.is_active(clock) {
            return Err(ProgramError::InvalidArgument);
        }

        let total_votes = self.vote_counts.yes + self.vote_counts.no + self.vote_counts.abstain;
        let participation = (total_votes * 100) as u8;

        if participation < self.quorum {
            self.status = ProposalStatus::Failed;
            msg!("Proposal failed: Insufficient quorum");
            return Ok(());
        }

        if self.vote_counts.yes > self.vote_counts.no {
            self.status = ProposalStatus::Succeeded;
            msg!("Proposal succeeded");
        } else {
            self.status = ProposalStatus::Failed;
            msg!("Proposal failed: More NO votes than YES votes");
        }

        Ok(())
    }

    pub fn add_multisig_signer(&mut self, signer: Pubkey) -> Result<(), ProgramError> {
        if self.multisig_signers.len() >= self.required_signatures as usize {
            return Err(ProgramError::InvalidArgument);
        }

        if !self.multisig_signers.contains(&signer) {
            self.multisig_signers.push(signer);
        }

        Ok(())
    }

    pub fn can_execute(&self, clock: &Clock) -> bool {
        if self.status != ProposalStatus::Succeeded {
            return false;
        }

        let current_time = clock.unix_timestamp;
        current_time >= self.voting_ends_at + self.execution_delay &&
        self.multisig_signers.len() >= self.required_signatures as usize
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum VoteType {
    Yes,
    No,
    Abstain,
}

impl Sealed for Proposal {}

impl Pack for Proposal {
    const LEN: usize = 1000;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut data = Vec::with_capacity(Self::LEN);
        data.extend_from_slice(&[1u8]); // is_initialized = true
        data.extend_from_slice(&self.id.to_le_bytes());
        data.extend_from_slice(&self.proposer.to_bytes());
        data.extend_from_slice(&(self.title.len() as u32).to_le_bytes());
        data.extend_from_slice(self.title.as_bytes());
        data.extend_from_slice(&(self.description.len() as u32).to_le_bytes());
        data.extend_from_slice(self.description.as_bytes());
        data.extend_from_slice(&self.target_program.to_bytes());
        data.extend_from_slice(&self.staked_amount.to_le_bytes());
        data.extend_from_slice(&self.vote_counts.yes.to_le_bytes());
        data.extend_from_slice(&self.vote_counts.no.to_le_bytes());
        data.extend_from_slice(&self.vote_counts.abstain.to_le_bytes());
        data.extend_from_slice(&self.voting_ends_at.to_le_bytes());
        
        dst[..data.len()].copy_from_slice(&data);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        Self::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
}

impl IsInitialized for Proposal {
    fn is_initialized(&self) -> bool {
        true // A proposal is always initialized when created
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GovernanceConfig {
    pub min_stake_amount: u64,
    pub min_quorum: u8,
    pub user_proposal_counts: HashMap<Pubkey, u32>,
    pub last_proposal_times: HashMap<Pubkey, i64>,
    pub user_votes: HashMap<Pubkey, HashSet<u64>>, // user -> set of proposal IDs voted on
    pub proposal_metadata: HashMap<u64, ProposalMetadata>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ProposalMetadata {
    pub total_voting_power: u64,
    pub vote_weights: HashMap<Pubkey, u64>,
}

impl GovernanceConfig {
    pub fn new(min_stake_amount: u64) -> Self {
        Self {
            min_stake_amount,
            min_quorum: MIN_QUORUM,
            user_proposal_counts: HashMap::new(),
            last_proposal_times: HashMap::new(),
            user_votes: HashMap::new(),
            proposal_metadata: HashMap::new(),
        }
    }

    pub fn can_create_proposal(&self, user: &Pubkey, clock: &Clock) -> bool {
        if let Some(last_time) = self.last_proposal_times.get(user) {
            if clock.unix_timestamp - last_time < PROPOSAL_COOLDOWN {
                return false;
            }
        }
        true
    }

    pub fn record_proposal(&mut self, user: &Pubkey, proposal_id: u64, clock: &Clock) {
        *self.user_proposal_counts.entry(*user).or_insert(0) += 1;
        self.last_proposal_times.insert(*user, clock.unix_timestamp);
        self.proposal_metadata.insert(proposal_id, ProposalMetadata {
            total_voting_power: 0,
            vote_weights: HashMap::new(),
        });
    }

    pub fn has_voted(&self, user: &Pubkey, proposal_id: u64) -> bool {
        self.user_votes
            .get(user)
            .map_or(false, |votes| votes.contains(&proposal_id))
    }

    pub fn record_vote(&mut self, user: &Pubkey, proposal_id: u64, vote_weight: u64) {
        let mut voted_accounts = self.user_votes.entry(*user)
            .or_insert_with(|| HashSet::new());
        voted_accounts.insert(proposal_id);

        if let Some(metadata) = self.proposal_metadata.get_mut(&proposal_id) {
            metadata.total_voting_power += vote_weight;
            metadata.vote_weights.insert(*user, vote_weight);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proposal_lifecycle() {
        let clock = Clock {
            unix_timestamp: 1000,
            ..Clock::default()
        };

        let mut proposal = Proposal::new(
            1,
            Pubkey::new_unique(),
            "Test".to_string(),
            "Description".to_string(),
            Pubkey::new_unique(),
            1000,
            MIN_PROPOSAL_DURATION,
            TestParams {
                memory_fence_required: true,
                entropy_checks: true,
            },
            &clock,
        ).unwrap();

        assert_eq!(proposal.status, ProposalStatus::Draft);
        assert!(proposal.is_active(&clock));

        let voter = Pubkey::new_unique();
        proposal.cast_vote(&voter, VoteType::Yes, 100, &clock).unwrap();
        assert_eq!(proposal.vote_counts.yes, 100);

        proposal.finalize_vote(&clock).unwrap();
        assert_eq!(proposal.status, ProposalStatus::Succeeded);
    }

    #[test]
    fn test_governance_config() {
        let mut config = GovernanceConfig::new(1000);
        let user = Pubkey::new_unique();
        let clock = Clock {
            unix_timestamp: 1000,
            ..Clock::default()
        };

        assert!(config.can_create_proposal(&user, &clock));
        config.record_proposal(&user, 1, &clock);
        assert!(!config.can_create_proposal(&user, &clock));

        assert!(!config.has_voted(&user, 1));
        config.record_vote(&user, 1, 100);
        assert!(config.has_voted(&user, 1));
    }
}
