use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub status: ProposalStatus,
    pub vote_counts: VoteCounts,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Copy, BorshSerialize, BorshDeserialize)]
pub enum ProposalStatus {
    Active,
    Executed,
    Cancelled,
    Expired,
    Failed,
}

#[derive(Debug, Clone, Copy, BorshSerialize, BorshDeserialize)]
pub struct VoteCounts {
    pub yes_votes: u64,
    pub no_votes: u64,
    pub abstain_votes: u64,
}

#[derive(Debug, Clone, Copy, BorshSerialize, BorshDeserialize)]
pub enum VoteType {
    Yes,
    No,
    Abstain,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct GovernanceConfig {
    pub voting_delay: u64,
    pub voting_period: u64,
    pub quorum: u64,
    pub proposal_threshold: u64,
    pub timelock_delay: u64,
} 