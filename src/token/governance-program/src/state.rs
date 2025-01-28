#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct GovernanceState {
    pub is_initialized: bool,
    pub config: GovernanceConfig,
    pub proposal_count: u64,
    pub total_staked: u64,
}

impl GovernanceState {
    pub const LEN: usize = 1 + 32 + 8 + 8;

    pub fn pack_into_slice(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        let data = borsh::to_vec(self).map_err(|_| ProgramError::InvalidAccountData)?;
        dst[..data.len()].copy_from_slice(&data);
        Ok(())
    }

    pub fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct GovernanceConfig {
    pub min_stake_amount: u64,
    pub min_vote_threshold: u64,
    pub min_proposal_duration: i64,
    pub max_proposal_duration: i64,
    pub voting_delay: i64,
    pub voting_period: i64,
    pub quorum_votes: u64,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            min_stake_amount: 1000,
            min_vote_threshold: 100,
            min_proposal_duration: 86400, // 1 day
            max_proposal_duration: 604800, // 1 week
            voting_delay: 0,
            voting_period: 259200, // 3 days
            quorum_votes: 5000,
        }
    }
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub target_program: Pubkey,
    pub created_at: i64,
    pub voting_starts_at: i64,
    pub voting_ends_at: i64,
    pub executed_at: Option<i64>,
    pub status: ProposalStatus,
    pub total_voting_power: u64,
    pub vote_counts: VoteCounts,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq)]
pub struct VoteCounts {
    pub yes: u64,
    pub no: u64,
    pub abstain: u64,
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

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, PartialEq)]
pub enum ProposalStatus {
    Draft,
    Active,
    Succeeded,
    Failed,
    Executed,
    Cancelled,
}

impl Proposal {
    pub const LEN: usize = 8 + 32 + 64 + 256 + 32 + 8 + 8 + 8 + 9 + 1 + 8 + 24;

    pub fn pack_into_slice(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        let data = borsh::to_vec(self).map_err(|_| ProgramError::InvalidAccountData)?;
        dst[..data.len()].copy_from_slice(&data);
        Ok(())
    }

    pub fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct Vote {
    pub voter: Pubkey,
    pub proposal_id: u64,
    pub vote_type: VoteType,
    pub amount: u64,
    pub voted_at: i64,
}

impl Vote {
    pub const LEN: usize = 32 + 8 + 1 + 8 + 8;

    pub fn pack_into_slice(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        let data = borsh::to_vec(self).map_err(|_| ProgramError::InvalidAccountData)?;
        dst[..data.len()].copy_from_slice(&data);
        Ok(())
    }

    pub fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct VoterStake {
    pub owner: Pubkey,
    pub amount: u64,
    pub locked_until: i64,
}

impl VoterStake {
    pub const LEN: usize = 32 + 8 + 8;

    pub fn pack_into_slice(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        let data = borsh::to_vec(self).map_err(|_| ProgramError::InvalidAccountData)?;
        dst[..data.len()].copy_from_slice(&data);
        Ok(())
    }

    pub fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        borsh::BorshDeserialize::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
} 