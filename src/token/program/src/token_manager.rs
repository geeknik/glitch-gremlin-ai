use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    program_pack::Pack,
    msg
};
use spl_token::instruction::{burn, transfer};

pub struct TokenManager;

impl TokenManager {
    pub fn get_balance(token_account: &AccountInfo) -> Result<u64, ProgramError> {
        let account = spl_token::state::Account::unpack(&token_account.data.borrow())?;
        Ok(account.amount)
    }

    pub fn burn_tokens(token_account: &AccountInfo, amount: u64) -> ProgramResult {
        let _burn_ix = burn(
            &solana_program::system_program::id(), // Use system program for native burns per DESIGN.md 9.1
            token_account.key, // Mint account
            token_account.key, // Token account
            token_account.key, // Authority
            &[],
            amount,
        )?;
        
        msg!("Burned {} tokens", amount);
        Ok(())
    }

    pub fn transfer_tokens(
        source: &AccountInfo,
        destination: &Pubkey,
        amount: u64,
    ) -> ProgramResult {
        let _transfer_ix = transfer(
            &spl_token::id(),
            source.key,
            destination,
            source.owner,
            &[],
            amount,
        )?;

        msg!("Transferred {} tokens to {}", amount, destination);
        Ok(())
    }
}
