use borsh::{BorshSerialize, BorshDeserialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GovernanceProposal {
    /// Unique ID of the proposal
    pub id: u64,
    /// The proposer's public key
    pub proposer: Pubkey,
    /// Description of the chaos campaign
    pub description: String,
    /// Target program to test
    pub target_program: Pubkey,
    /// Amount of GLITCH tokens staked
    pub staked_amount: u64,
    /// Current vote count
    pub votes_for: u64,
    pub votes_against: u64,
    /// Voting deadline (Unix timestamp)
    pub deadline: i64,
    /// Status of the proposal
    pub status: ProposalStatus,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum ProposalStatus {
    Pending,
    Approved,
    Rejected,
    Executed,
}

impl GovernanceProposal {
    pub fn new(
        id: u64,
        proposer: Pubkey,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
    ) -> Self {
        Self {
            id,
            proposer,
            description,
            target_program,
            staked_amount,
            votes_for: 0,
            votes_against: 0,
            deadline,
            status: ProposalStatus::Pending,
        }
    }
}
