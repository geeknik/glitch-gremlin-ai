use solana_program::{
    pubkey::Pubkey,
    program_error::ProgramError,
};
use spl_token::state::Account as TokenAccount;

pub struct TokenManager;

impl TokenManager {
    pub fn validate_token_account(
        token_account: &TokenAccount,
        expected_owner: &Pubkey,
    ) -> Result<(), ProgramError> {
        if token_account.owner != *expected_owner {
            return Err(ProgramError::InvalidAccountData);
        }
        
        if token_account.delegate.is_some() {
            return Err(ProgramError::InvalidAccountData);
        }

        Ok(())
    }

    pub fn calculate_escrow_amount(
        base_fee: u64,
        complexity: u8,
        duration: u64,
    ) -> u64 {
        // Simple formula for now, can be made more sophisticated
        base_fee * complexity as u64 * duration
    }
}
