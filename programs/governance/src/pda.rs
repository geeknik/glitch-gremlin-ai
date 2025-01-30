use anchor_lang::prelude::*;

pub fn find_proposal_address(
    program_id: &Pubkey,
    proposal_id: u64,
) -> (Pubkey, u8) {
    let proposal_id_bytes = proposal_id.to_le_bytes();
    Pubkey::find_program_address(
        &[
            b"proposal".as_ref(),
            proposal_id_bytes.as_ref(),
        ],
        program_id,
    )
}

pub fn find_vote_address(
    program_id: &Pubkey,
    proposal: &Pubkey,
    voter: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"vote".as_ref(),
            proposal.as_ref(),
            voter.as_ref(),
        ],
        program_id,
    )
}

pub fn find_treasury_address(
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    let seeds = &[b"treasury"];
    Pubkey::find_program_address(seeds, program_id)
}

// ... rest of the file ... 