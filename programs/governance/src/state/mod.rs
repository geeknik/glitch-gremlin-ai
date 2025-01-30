use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub description: String,
    pub chaos_params: ChaosParams,
    pub created_at: i64,
    pub voting_ends_at: i64,
    pub execution_delay: i64,
    pub quorum_percentage: u8,
    pub approval_threshold_percentage: u8,
    pub state: ProposalState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub amount: u64,
    pub support: bool,
    pub timestamp: i64,
    pub voting_power: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ChaosParams {
    pub target_program: Pubkey,
    pub requires_funding: bool,
    pub treasury_amount: u64,
    pub max_duration: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ProposalState {
    Draft,
    Active,
    Succeeded,
    Executed,
    Failed,
    Cancelled,
}

// ... rest of the file ... 