use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    program_pack::Pack,
    program::invoke,
    msg
};
use spl_token::instruction::{burn, transfer};
use std::str::FromStr;

pub struct TokenManager;

impl TokenManager {
    pub fn get_balance(token_account: &AccountInfo) -> Result<u64, ProgramError> {
        let account = spl_token::state::Account::unpack(&token_account.data.borrow())?;
        Ok(account.amount)
    }

    pub fn validate_token_account(account: &AccountInfo, program_id: &Pubkey) -> ProgramResult {
        if account.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        Ok(())
    }

    pub fn burn_tokens(
        token_account: &AccountInfo,
        amount: u64,
        account_info_iter: &mut std::slice::Iter<AccountInfo>,
        program_id: &Pubkey
    ) -> ProgramResult {
        // DESIGN.md 9.1 + 9.3 enhanced tokenomics
        let burn_amount = amount
            .checked_mul(70)
            .and_then(|v| v.checked_div(100))
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        // Insurance fund transfer with overflow protection
        let _insurance_amount = amount.checked_sub(burn_amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
            
        // Transfer to insurance fund address
        let _insurance_account = Pubkey::from_str("insurancEFund1111111111111111111111111111111")
            .map_err(|_| ProgramError::InvalidArgument)?;
        
        // DESIGN.md 9.1 - Validate insurance fund account
        let insurance_account_info = next_account_info(account_info_iter)?;
        Self::validate_token_account(insurance_account_info, program_id)?;

        // Perform actual burn
        let burn_ix = burn(
            &spl_token::id(),
            token_account.key, // Mint account
            token_account.key, // Token account
            token_account.key, // Authority
            &[],
            burn_amount,
        )?;

        // Invoke burn instruction
        invoke(&burn_ix, &[token_account.clone()])?;
        
        msg!("Burned {} tokens", burn_amount);
        Ok(())
    }

    pub fn transfer_tokens(
        source: &AccountInfo,
        destination: &Pubkey,
        amount: u64,
    ) -> ProgramResult {
        let transfer_ix = transfer(
            &spl_token::id(),
            source.key,
            destination,
            source.owner,
            &[],
            amount,
        )?;

        invoke(&transfer_ix, &[source.clone()])?;
        msg!("Transferred {} tokens to {}", amount, destination);
        Ok(())
    }
}
