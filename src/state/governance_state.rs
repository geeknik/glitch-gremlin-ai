use solana_program::pubkey::Pubkey;
use anchor_lang::prelude::*;

/// Governance state structure tracking program administration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GovernanceState {
    /// Authority public key with admin privileges
    pub authority: Pubkey,
    /// Count of active governance proposals
    pub proposal_count: u64,
}

impl GovernanceState {
    /// Creates new GovernanceState with initial values
    /// 
    /// # Arguments
    /// * `authority` - Initial authority public key
    pub fn new(authority: Pubkey) -> Self {
        Self {
            authority,
            proposal_count: 0,
        }
    }
} 
