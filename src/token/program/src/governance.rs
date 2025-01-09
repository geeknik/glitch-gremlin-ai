use borsh::{BorshSerialize, BorshDeserialize};
use solana_program::{
    pubkey::Pubkey,
    program_error::ProgramError,
};
use crate::state::EscrowAccount;

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
    /// Escrow account for test funds
    pub escrow_account: Option<Pubkey>,
    /// Test parameters
    pub test_params: TestParams,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TestParams {
    pub test_type: String, // FUZZ, LOAD, EXPLOIT, CONCURRENCY
    pub duration: u64,    // in seconds
    pub intensity: u8,    // 1-10
    pub max_latency: u64, // in ms
    pub error_threshold: u8,
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
        test_params: TestParams,
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
            escrow_account: None,
            test_params,
        }
    }
}
