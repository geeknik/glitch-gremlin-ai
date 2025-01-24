use borsh_derive::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct GovernanceProposal {
    pub id: u64,
    pub proposer: Pubkey,
    #[borsh(skip)]  // Remove description field from on-chain storage
    pub description: String,
    pub target_program: Pubkey,
    pub status: ProposalStatus,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub start_time: i64,
    pub end_time: i64,
    // Added from DESIGN.md 9.3
    pub security_level: u8,
    pub execution_delay: i64,
    pub insurance_fund: Pubkey,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Failed,
    Executed,
}
