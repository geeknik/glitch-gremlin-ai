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

#[derive(BorshSerialize, BorshDeserialize, Debug)]
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

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ProposalMetadata {
    pub created_at: i64,
    pub updated_at: i64,
    pub version: u8,
    pub ipfs_cid: String, // IPFS CID for additional proposal data
    pub audit_logs: Vec<String>, // Audit trail of proposal changes
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GovernanceConfig {
    pub min_voting_period: i64,
    pub max_voting_period: i64,
    pub min_stake_amount: u64,
    pub voting_quorum: u64,
    pub execution_delay: i64,
    pub upgrade_authority: Pubkey,
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
        let mut slice = dst;
        self.total_staked.pack_into_slice(&mut slice[..8]);
        self.active_proposals.pack_into_slice(&mut slice[8..16]);
        self.total_proposals.pack_into_slice(&mut slice[16..24]);
        self.total_votes.pack_into_slice(&mut slice[24..32]);
        self.config.pack_into_slice(&mut slice[32..88]);
        self.is_initialized.pack_into_slice(&mut slice[88..89]);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let total_staked = u64::unpack_from_slice(&src[..8])?;
        let active_proposals = u64::unpack_from_slice(&src[8..16])?;
        let total_proposals = u64::unpack_from_slice(&src[16..24])?;
        let total_votes = u64::unpack_from_slice(&src[24..32])?;
        let config = GovernanceConfig::unpack_from_slice(&src[32..88])?;
        let is_initialized = bool::unpack_from_slice(&src[88..89])?;
        
        Ok(Self {
            total_staked,
            active_proposals,
            total_proposals,
            total_votes,
            config,
            is_initialized,
        })
    }
}

impl Pack for GovernanceConfig {
    const LEN: usize = 8 + 8 + 8 + 8 + 8 + 32;
    
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut slice = dst;
        self.min_voting_period.pack_into_slice(&mut slice[..8]);
        self.max_voting_period.pack_into_slice(&mut slice[8..16]);
        self.min_stake_amount.pack_into_slice(&mut slice[16..24]);
        self.voting_quorum.pack_into_slice(&mut slice[24..32]);
        self.execution_delay.pack_into_slice(&mut slice[32..40]);
        self.upgrade_authority.pack_into_slice(&mut slice[40..72]);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let min_voting_period = i64::unpack_from_slice(&src[..8])?;
        let max_voting_period = i64::unpack_from_slice(&src[8..16])?;
        let min_stake_amount = u64::unpack_from_slice(&src[16..24])?;
        let voting_quorum = u64::unpack_from_slice(&src[24..32])?;
        let execution_delay = i64::unpack_from_slice(&src[32..40])?;
        let upgrade_authority = Pubkey::unpack_from_slice(&src[40..72])?;
        
        Ok(Self {
            min_voting_period,
            max_voting_period,
            min_stake_amount,
            voting_quorum,
            execution_delay,
            upgrade_authority,
        })
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
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
    pub vote_weights: HashMap<Pubkey, u64>, // Track vote weights
    pub total_voting_power: u64, // Total voting power for this proposal
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Passed,
    Failed,
    Executed,
    Cancelled,
}

impl Sealed for Proposal {}
impl IsInitialized for Proposal {
    fn is_initialized(&self) -> bool {
        self.status != ProposalStatus::Draft
    }
}

impl Pack for Proposal {
    const LEN: usize = 8 + 32 + 32 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 32 * 100 + 1000; // Additional space for vote weights
    
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut slice = dst;
        self.id.pack_into_slice(&mut slice[..8]);
        self.proposer.pack_into_slice(&mut slice[8..40]);
        self.title.pack_into_slice(&mut slice[40..72]);
        self.description.pack_into_slice(&mut slice[72..104]);
        self.target_program.pack_into_slice(&mut slice[104..136]);
        self.status.pack_into_slice(&mut slice[136..137]);
        self.yes_votes.pack_into_slice(&mut slice[137..145]);
        self.no_votes.pack_into_slice(&mut slice[145..153]);
        self.abstain_votes.pack_into_slice(&mut slice[153..161]);
        self.start_time.pack_into_slice(&mut slice[161..169]);
        self.end_time.pack_into_slice(&mut slice[169..177]);
        self.execution_time.pack_into_slice(&mut slice[177..185]);
        self.staked_amount.pack_into_slice(&mut slice[185..193]);
        self.voters.pack_into_slice(&mut slice[193..]);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let id = u64::unpack_from_slice(&src[..8])?;
        let proposer = Pubkey::unpack_from_slice(&src[8..40])?;
        let title = String::unpack_from_slice(&src[40..72])?;
        let description = String::unpack_from_slice(&src[72..104])?;
        let target_program = Pubkey::unpack_from_slice(&src[104..136])?;
        let status = ProposalStatus::unpack_from_slice(&src[136..137])?;
        let yes_votes = u64::unpack_from_slice(&src[137..145])?;
        let no_votes = u64::unpack_from_slice(&src[145..153])?;
        let abstain_votes = u64::unpack_from_slice(&src[153..161])?;
        let start_time = i64::unpack_from_slice(&src[161..169])?;
        let end_time = i64::unpack_from_slice(&src[169..177])?;
        let execution_time = Option::<i64>::unpack_from_slice(&src[177..185])?;
        let staked_amount = u64::unpack_from_slice(&src[185..193])?;
        let voters = Vec::<Pubkey>::unpack_from_slice(&src[193..])?;
        
        Ok(Self {
            id,
            proposer,
            title,
            description,
            target_program,
            status,
            yes_votes,
            no_votes,
            abstain_votes,
            start_time,
            end_time,
            execution_time,
            staked_amount,
            voters,
        })
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum GovernanceInstruction {
    Initialize {
        config: GovernanceConfig,
    },
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
    CancelProposal {
        proposal_id: u64,
    },
    StakeTokens {
        amount: u64,
        lockup_period: i64,
    },
    UnstakeTokens {
        stake_id: u64,
    },
    UpdateConfig {
        new_config: GovernanceConfig,
    },
    EmergencyPause,
    EmergencyResume,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum VoteType {
    Yes,
    No,
    Abstain,
}

impl GovernanceInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => Self::Initialize {
                config: GovernanceConfig::try_from_slice(rest)?,
            },
            1 => Self::CreateProposal {
                title: String::try_from_slice(&rest[..32])?,
                description: String::try_from_slice(&rest[32..64])?,
                target_program: Pubkey::try_from_slice(&rest[64..96])?,
                duration: i64::try_from_slice(&rest[96..104])?,
                staking_amount: u64::try_from_slice(&rest[104..112])?,
            },
            2 => Self::Vote {
                proposal_id: u64::try_from_slice(&rest[..8])?,
                vote_type: VoteType::try_from_slice(&rest[8..9])?,
                amount: u64::try_from_slice(&rest[9..17])?,
            },
            3 => Self::ExecuteProposal {
                proposal_id: u64::try_from_slice(&rest[..8])?,
            },
            4 => Self::CancelProposal {
                proposal_id: u64::try_from_slice(&rest[..8])?,
            },
            5 => Self::StakeTokens {
                amount: u64::try_from_slice(&rest[..8])?,
                lockup_period: i64::try_from_slice(&rest[8..16])?,
            },
            6 => Self::UnstakeTokens {
                stake_id: u64::try_from_slice(&rest[..8])?,
            },
            7 => Self::UpdateConfig {
                new_config: GovernanceConfig::try_from_slice(rest)?,
            },
            8 => Self::EmergencyPause,
            9 => Self::EmergencyResume,
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
    msg!("Processing governance instruction");

    let instruction = GovernanceInstruction::unpack(instruction_data)?;

    match instruction {
        GovernanceInstruction::CreateProposal {
            title,
            description,
            target_program,
            duration,
        } => process_create_proposal(program_id, accounts, title, description, target_program, duration),
        GovernanceInstruction::Vote {
            proposal_id,
            support,
            amount,
        } => process_vote(program_id, accounts, proposal_id, support, amount),
        GovernanceInstruction::ExecuteProposal { proposal_id } => {
            process_execute_proposal(program_id, accounts, proposal_id)
        }
        GovernanceInstruction::StakeTokens {
            amount,
            lockup_period,
        } => process_stake_tokens(program_id, accounts, amount, lockup_period),
        GovernanceInstruction::UnstakeTokens { stake_id } => {
            process_unstake_tokens(program_id, accounts, stake_id)
        }
    }
}

// Proposal creation
fn process_create_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    title: String,
    description: String,
    target_program: Pubkey,
    duration: i64,
) -> ProgramResult {
    // Implementation
    Ok(())
}

// Voting
fn process_vote(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u64,
    support: bool,
    amount: u64,
) -> ProgramResult {
    // Implementation
    Ok(())
}

// Proposal execution
fn process_execute_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u64,
) -> ProgramResult {
    // Implementation
    Ok(())
}

// Staking
fn process_stake_tokens(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
    lockup_period: i64,
) -> ProgramResult {
    // Implementation
    Ok(())
}

// Unstaking
fn process_unstake_tokens(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    stake_id: u64,
) -> ProgramResult {
    // Implementation
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

// Serialization
impl GovernanceInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Implementation
        Ok(GovernanceInstruction::CreateProposal {
            title: String::new(),
            description: String::new(),
            target_program: Pubkey::default(),
            duration: 0,
        })
    }
}
