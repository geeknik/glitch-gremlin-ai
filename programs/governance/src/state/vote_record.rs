use anchor_lang::prelude::*;

#[account]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote_weight: u64,
    pub is_yes_vote: bool,
    pub voted_at: i64,
}

impl VoteRecord {
    pub fn space() -> usize {
        8 +  // discriminator
        32 + // proposal
        32 + // voter
        8 +  // vote_weight
        1 +  // is_yes_vote
        8    // voted_at
    }

    pub fn create(
        proposal: Pubkey,
        voter: Pubkey,
        vote_weight: u64,
        is_yes_vote: bool,
        clock: &Clock,
    ) -> Self {
        Self {
            proposal,
            voter,
            vote_weight,
            is_yes_vote,
            voted_at: clock.unix_timestamp,
        }
    }
} use anchor_lang::prelude::*;

#[account]
pub struct VoteRecord {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub stake_account: Pubkey,
    pub vote_weight: u64,
    pub is_yes_vote: bool,
    pub timestamp: i64,
}
