use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{clock::Clock, rent::Rent, Sysvar},
    program_pack::{IsInitialized, Pack, Sealed},
};
use borsh::{BorshDeserialize, BorshSerialize};
use std::convert::TryInto;
use std::collections::{HashMap, HashSet};

// Governance parameters
const MIN_PROPOSAL_DURATION: i64 = 86400; // 1 day
const MAX_PROPOSAL_DURATION: i64 = 604800; // 1 week 
const MIN_STAKE_AMOUNT: u64 = 1000; // Minimum tokens to stake
const VOTE_QUORUM: u64 = 10; // Percentage of total stake required
const EXECUTION_DELAY: i64 = 86400; // 1 day delay after vote passes
const MAX_PROPOSALS_PER_USER: u64 = 3; // Max active proposals per user
const MIN_TIME_BETWEEN_PROPOSALS: i64 = 3600; // 1 hour between proposals
const MAX_VOTES_PER_USER: u64 = 1; // Only 1 vote per user per proposal
const MAX_PROPOSAL_TITLE_LENGTH: usize = 100; // Max proposal title length
const MAX_PROPOSAL_DESC_LENGTH: usize = 1000; // Max proposal description length
const MAX_PROPOSAL_PARAMS_SIZE: usize = 1024; // Max proposal params size in bytes
const MAX_ACTIVE_PROPOSALS: u64 = 100; // Max active proposals system-wide

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct GovernanceState {
    pub total_staked: u64,
    pub active_proposals: u64,
    pub total_proposals: u64,
    pub total_votes: u64,
    pub config: GovernanceConfig,
    pub is_initialized: bool,
    pub user_proposal_counts: HashMap<Pubkey, u64>, // Track proposals per user
    pub last_proposal_times: HashMap<Pubkey, i64>, // Track last proposal time per user
    pub user_votes: HashMap<Pubkey, HashSet<Pubkey>>, // Track votes per user
    pub active_proposal_ids: Vec<Pubkey>, // Track active proposals
    pub proposal_metadata: HashMap<Pubkey, ProposalMetadata>, // Additional proposal metadata
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct ProposalMetadata {
    pub created_at: i64,
    pub updated_at: i64,
    pub version: u8,
    pub ipfs_cid: String, // IPFS CID for additional proposal data
    pub audit_logs: Vec<String>, // Audit trail of proposal changes
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct GovernanceConfig {
    pub min_stake_amount: u64,
    pub min_voting_period: i64,
    pub max_voting_period: i64,
    pub min_quorum: u8,
    pub user_proposal_counts: HashMap<Pubkey, u64>,
    pub last_proposal_times: HashMap<Pubkey, i64>,
    pub user_votes: HashMap<Pubkey, HashSet<Pubkey>>,
    pub proposal_metadata: HashMap<Pubkey, ProposalMetadata>,
}

impl solana_program::program_pack::Sealed for GovernanceConfig {}

impl solana_program::program_pack::Pack for GovernanceConfig {
    const LEN: usize = 1000;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        Self::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
}

impl Sealed for GovernanceState {}
impl IsInitialized for GovernanceState {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for GovernanceState {
    const LEN: usize = 8 + 8 + 8 + 8 + 1 + 8 + 8 + 8 + 8 + 8 + 32 + 2000; // Increased space for additional metadata
    
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = borsh::to_vec(self)
            .map_err(|_| ProgramError::InvalidAccountData)
            .unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub target_program: Pubkey,
    pub status: ProposalStatus,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub abstain_votes: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub execution_time: Option<i64>,
    pub staked_amount: u64,
    pub voters: Vec<Pubkey>,
    pub total_voting_power: u64,
    pub vote_weights: Vec<u64>,
}

impl Proposal {
    pub fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = borsh::to_vec(self)
            .map_err(|_| ProgramError::InvalidAccountData)
            .unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }

    pub fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub enum GovernanceInstruction {
    CreateProposal {
        title: String,
        description: String,
        target_program: Pubkey,
        duration: i64,
        staking_amount: u64,
    },
    Vote {
        proposal_id: u64,
        vote_type: VoteType,
        amount: u64,
    },
    ExecuteProposal {
        proposal_id: u64,
    },
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq)]
pub enum VoteType {
    Yes,
    No,
    Abstain,
}

impl GovernanceInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => Self::CreateProposal {
                title: String::try_from_slice(&rest[..32])?,
                description: String::try_from_slice(&rest[32..64])?,
                target_program: Pubkey::try_from_slice(&rest[64..96])?,
                duration: i64::try_from_slice(&rest[96..104])?,
                staking_amount: u64::try_from_slice(&rest[104..112])?,
            },
            1 => Self::Vote {
                proposal_id: u64::try_from_slice(&rest[..8])?,
                vote_type: VoteType::try_from_slice(&rest[8..9])?,
                amount: u64::try_from_slice(&rest[9..17])?,
            },
            2 => Self::ExecuteProposal {
                proposal_id: u64::try_from_slice(&rest[..8])?,
            },
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}

// Entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = GovernanceInstruction::try_from_slice(instruction_data)?;

    match instruction {
        GovernanceInstruction::CreateProposal {
            title,
            description,
            target_program,
            duration,
            staking_amount,
        } => process_create_proposal(
            program_id,
            accounts,
            title,
            description,
            target_program,
            duration,
            staking_amount,
        ),
        GovernanceInstruction::Vote {
            proposal_id,
            vote_type,
            amount,
        } => process_vote(program_id, accounts, proposal_id, vote_type, amount),
        GovernanceInstruction::ExecuteProposal { proposal_id } => {
            process_execute_proposal(program_id, accounts, proposal_id)
        }
    }
}

fn process_create_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    title: String,
    description: String,
    target_program: Pubkey,
    duration: i64,
    staking_amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let proposal_info = next_account_info(account_info_iter)?;
    let proposer_info = next_account_info(account_info_iter)?;
    let governance_info = next_account_info(account_info_iter)?;

    // Validate accounts
    if !proposer_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    if proposal_info.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Load governance state
    let mut governance_state = GovernanceState::unpack_from_slice(&governance_info.data.borrow())?;

    // Validate proposal parameters
    if duration < MIN_PROPOSAL_DURATION || duration > MAX_PROPOSAL_DURATION {
        return Err(ProgramError::InvalidArgument);
    }

    if staking_amount < MIN_STAKE_AMOUNT {
        return Err(ProgramError::InsufficientFunds);
    }

    // Check user proposal limits
    let user_proposal_count = governance_state.user_proposal_counts
        .get(proposer_info.key)
        .copied()
        .unwrap_or(0);

    if user_proposal_count >= MAX_PROPOSALS_PER_USER {
        return Err(ProgramError::InvalidArgument);
    }

    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Create new proposal
    let proposal = Proposal {
        id: governance_state.total_proposals + 1,
        proposer: *proposer_info.key,
        title,
        description,
        target_program,
        status: ProposalStatus::Active,
        yes_votes: 0,
        no_votes: 0,
        abstain_votes: 0,
        start_time: current_time,
        end_time: current_time + duration,
        execution_time: None,
        staked_amount: staking_amount,
        voters: Vec::new(),
        total_voting_power: 0,
        vote_weights: Vec::new(),
    };

    // Update governance state
    governance_state.total_proposals += 1;
    governance_state.active_proposals += 1;
    governance_state.user_proposal_counts.insert(*proposer_info.key, user_proposal_count + 1);
    governance_state.last_proposal_times.insert(*proposer_info.key, current_time);

    // Save states
    proposal.pack_into_slice(&mut proposal_info.data.borrow_mut());
    governance_state.pack_into_slice(&mut governance_info.data.borrow_mut());

    Ok(())
}

fn process_vote(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u64,
    vote_type: VoteType,
    amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let proposal_info = next_account_info(account_info_iter)?;
    let voter_info = next_account_info(account_info_iter)?;
    let governance_info = next_account_info(account_info_iter)?;

    // Validate accounts
    if !voter_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    if proposal_info.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Load states
    let mut proposal = Proposal::unpack_from_slice(&proposal_info.data.borrow())?;
    let mut governance_state = GovernanceState::unpack_from_slice(&governance_info.data.borrow())?;

    // Validate proposal status
    if proposal.status != ProposalStatus::Active {
        return Err(ProgramError::InvalidArgument);
    }

    // Check if user has already voted
    if proposal.voters.contains(voter_info.key) {
        return Err(ProgramError::InvalidArgument);
    }

    // Record vote
    match vote_type {
        VoteType::Yes => proposal.yes_votes += amount,
        VoteType::No => proposal.no_votes += amount,
        VoteType::Abstain => proposal.abstain_votes += amount,
    }

    proposal.voters.push(*voter_info.key);
    proposal.total_voting_power += amount;

    // Update states
    proposal.pack_into_slice(&mut proposal_info.data.borrow_mut());
    governance_state.total_votes += 1;
    governance_state.pack_into_slice(&mut governance_info.data.borrow_mut());

    Ok(())
}

fn process_execute_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let proposal_info = next_account_info(account_info_iter)?;
    let executor_info = next_account_info(account_info_iter)?;
    let governance_info = next_account_info(account_info_iter)?;

    // Validate accounts
    if !executor_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    if proposal_info.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Load states
    let mut proposal = Proposal::unpack_from_slice(&proposal_info.data.borrow())?;
    let mut governance_state = GovernanceState::unpack_from_slice(&governance_info.data.borrow())?;

    // Validate proposal status
    if proposal.status != ProposalStatus::Active {
        return Err(ProgramError::InvalidArgument);
    }

    let clock = Clock::get()?;
    
    // Check if voting period has ended
    if clock.unix_timestamp <= proposal.end_time {
        return Err(ProgramError::InvalidArgument);
    }

    // Calculate results
    let total_votes = proposal.yes_votes + proposal.no_votes + proposal.abstain_votes;
    let quorum_reached = total_votes >= governance_state.config.min_stake_amount;
    let vote_succeeded = proposal.yes_votes > proposal.no_votes;

    proposal.status = if quorum_reached && vote_succeeded {
        ProposalStatus::Succeeded
    } else {
        ProposalStatus::Failed
    };

    // Update states
    proposal.pack_into_slice(&mut proposal_info.data.borrow_mut());
    governance_state.active_proposals -= 1;
    governance_state.pack_into_slice(&mut governance_info.data.borrow_mut());

    Ok(())
}

// Error handling
#[derive(Debug)]
pub enum GovernanceError {
    InvalidInstruction,
    NotEnoughTokens,
    ProposalNotFound,
    VotingPeriodEnded,
    AlreadyVoted,
    InvalidProposalState,
    StakeLocked,
    Unauthorized,
}

impl From<GovernanceError> for ProgramError {
    fn from(e: GovernanceError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
