use solana_program::pubkey::Pubkey;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GovernanceState {
    pub authority: Pubkey,
    pub proposal_count: u64,
}

impl GovernanceState {
    pub fn new(authority: Pubkey) -> Self {
        Self {
            authority,
            proposal_count: 0,
        }
    }
} 