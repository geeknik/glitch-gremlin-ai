use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::rent::Rent,
};
use spl_token::instruction::{mint_to, freeze_account};
use crate::state::{RateLimitInfo, SecurityLevel};
use solana_program::{
    entrypoint::ProgramResult,
    program_pack::Pack,
    program::{invoke, invoke_signed},
    msg,
    sysvar::{clock::Clock, Sysvar},
    system_instruction,
};
use spl_token::state::Account as TokenAccount;
use crate::{
    error::GlitchError,
};
use std::str::FromStr;

pub const MIN_STAKE_AMOUNT: u64 = 1_000_000; // 1M tokens
pub const GOVERNANCE_THRESHOLD: u64 = 100_000_000; // 100M tokens
pub const MAX_SUPPLY: u64 = 1_000_000_000; // 1B tokens
pub const VALIDATOR_REWARD: u64 = 1_000; // 1K tokens per validation
pub const BURN_RATE: u8 = 10; // 10% burn rate on transfers

// Rate limiting constants
pub const BASE_RATE: u64 = 100; // Base rate for normal operation
pub const PENALTY_RATE: u64 = 50; // Reduced rate (50%) when rate limit exceeded
pub const RATE_LIMIT_WINDOW: i64 = 3600; // 1 hour window for rate limiting

pub struct TokenManager<'a> {
    pub token_program: &'a AccountInfo<'a>,
    pub mint_authority: &'a AccountInfo<'a>,
    pub insurance_fund: &'a AccountInfo<'a>,
}

impl<'a> TokenManager<'a> {
    pub fn new(
        token_program: &'a AccountInfo<'a>,
        mint_authority: &'a AccountInfo<'a>,
        insurance_fund: &'a AccountInfo<'a>,
    ) -> Self {
        Self {
            token_program,
            mint_authority,
            insurance_fund,
        }
    }

    pub fn get_balance(token_account: &AccountInfo) -> Result<u64, ProgramError> {
        let account = TokenAccount::unpack(&token_account.data.borrow())?;
        Ok(account.amount)
    }

    pub fn validate_token_account(
        token_account: &AccountInfo,
        expected_owner: &Pubkey,
        expected_mint: &Pubkey,
    ) -> ProgramResult {
        let token_account_data = TokenAccount::unpack(&token_account.data.borrow())?;
        
        if token_account_data.owner != *expected_owner {
            msg!("Token account owner mismatch");
            return Err(GlitchError::InvalidAccountOwner.into());
        }
        
        if token_account_data.mint != *expected_mint {
            msg!("Token account mint mismatch");
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Check for delegate authority
        if token_account_data.delegate.is_some() {
            msg!("Token account has delegate authority");
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Verify account is not frozen
        if token_account_data.state != spl_token::state::AccountState::Initialized {
            msg!("Token account is frozen");
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        Ok(())
    }

    pub fn burn_tokens(
        &self,
        source: &'a AccountInfo<'a>,
        amount: u64,
        authority: &'a AccountInfo<'a>,
    ) -> ProgramResult {
        let burn_ix = spl_token::instruction::burn(
            self.token_program.key,
            source.key,
            &self.mint_authority.key,
            authority.key,
            &[],
            amount,
        )?;

        invoke(
            &burn_ix,
            &[
                source.clone(),
                self.mint_authority.clone(),
                authority.clone(),
                self.token_program.clone(),
            ],
        )
    }

    pub fn mint_to(
        &self,
        mint: &AccountInfo<'a>,
        destination: &AccountInfo<'a>,
        amount: u64,
    ) -> ProgramResult {
        if !self.mint_authority.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        let mint_ix = mint_to(
            self.token_program.key,
            mint.key,
            destination.key,
            self.mint_authority.key,
            &[],
            amount,
        )?;

        invoke_signed(
            &mint_ix,
            &[
                mint.clone(),
                destination.clone(),
                self.mint_authority.clone(),
                self.token_program.clone(),
            ],
            &[&[b"mint_authority", &[0]]],
        )
    }

    pub fn escrow_tokens(
        &self,
        source: &'a AccountInfo<'a>,
        escrow: &'a AccountInfo<'a>,
        authority: &'a AccountInfo<'a>,
        amount: u64,
        security_level: SecurityLevel,
    ) -> ProgramResult {
        // Validate minimum stake requirements
        let min_stake = match security_level {
            SecurityLevel::Low => 1000,
            SecurityLevel::Medium => 5000,
            SecurityLevel::High => 10000,
            SecurityLevel::Critical => 50000,
        };

        if amount < min_stake {
            return Err(GlitchError::InsufficientStake.into());
        }

        self.transfer_tokens(source, escrow, authority, amount)
    }

    pub fn release_stake(
        &self,
        escrow: &'a AccountInfo<'a>,
        destination: &'a AccountInfo<'a>,
        authority: &'a AccountInfo<'a>,
        amount: u64,
    ) -> ProgramResult {
        self.transfer_tokens(
            escrow,
            destination,
            authority,
            amount,
        )
    }

    pub fn transfer_tokens(
        &self,
        source: &'a AccountInfo<'a>,
        destination: &'a AccountInfo<'a>,
        authority: &'a AccountInfo<'a>,
        amount: u64,
    ) -> ProgramResult {
        let transfer_ix = spl_token::instruction::transfer(
            self.token_program.key,
            source.key,
            destination.key,
            authority.key,
            &[],
            amount,
        )?;

        invoke(
            &transfer_ix,
            &[
                source.clone(),
                destination.clone(),
                authority.clone(),
                self.token_program.clone(),
            ],
        )
    }

    pub fn freeze_account(
        &self,
        account: &AccountInfo<'a>,
        mint: &AccountInfo<'a>,
        freeze_authority: &AccountInfo<'a>,
    ) -> ProgramResult {
        if !freeze_authority.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        let freeze_ix = freeze_account(
            &spl_token::id(),
            account.key,
            mint.key,
            freeze_authority.key,
            &[],
        )?;

        invoke_signed(
            &freeze_ix,
            &[
                account.clone(),
                mint.clone(),
                freeze_authority.clone(),
                self.token_program.clone(),
            ],
            &[&[b"freeze_authority", &[0]]],
        )
    }

    pub fn get_token_balance(&self, token_account: &AccountInfo) -> Result<u64, ProgramError> {
        let account = TokenAccount::unpack(&token_account.data.borrow())?;
        Ok(account.amount)
    }

    pub fn get_minimum_stake(&self, security_level: SecurityLevel) -> u64 {
        match security_level {
            SecurityLevel::Critical => 50_000,  // As per DESIGN.md 9.1
            SecurityLevel::High => 10_000,
            SecurityLevel::Medium => 5_000,
            SecurityLevel::Low => 1_000,
        }
    }

    pub fn validate_rate_limit(
        &self,
        rate_limit: &RateLimitInfo,
        security_level: SecurityLevel,
    ) -> ProgramResult {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Reset window if needed
        if current_time - rate_limit.window_start > 3600 {
            return Ok(());
        }

        let max_requests = match security_level {
            SecurityLevel::Critical => 5,
            SecurityLevel::High => 10,
            SecurityLevel::Medium => 20,
            SecurityLevel::Low => 50,
        };

        if rate_limit.request_count >= max_requests {
            msg!("Rate limit exceeded for security level");
            return Err(GlitchError::RateLimitExceeded.into());
        }

        Ok(())
    }

    pub fn initialize_mint<'b>(
        program_id: &Pubkey,
        mint_info: &'b AccountInfo<'b>,
        mint_authority: &'b AccountInfo<'b>,
        rent: &Rent,
    ) -> Result<(), ProgramError> {
        if !rent.is_exempt(mint_info.lamports(), mint_info.data_len()) {
            return Err(ProgramError::AccountNotRentExempt);
        }

        // Initialize mint with fixed supply
        let mint_instruction = mint_to(
            &spl_token::id(),
            mint_info.key,
            mint_info.key,
            mint_authority.key,
            &[],
            MAX_SUPPLY,
        )?;

        // Execute mint instruction
        solana_program::program::invoke_signed(
            &mint_instruction,
            &[mint_info.clone(), mint_authority.clone()],
            &[],
        )?;

        Ok(())
    }

    pub fn validate_stake_amount(amount: u64) -> Result<(), ProgramError> {
        if amount < MIN_STAKE_AMOUNT {
            return Err(ProgramError::InsufficientFunds);
        }
        Ok(())
    }

    pub fn validate_governance_threshold(amount: u64) -> Result<(), ProgramError> {
        if amount < GOVERNANCE_THRESHOLD {
            return Err(ProgramError::InsufficientFunds);
        }
        Ok(())
    }

    pub fn calculate_validator_reward(
        security_level: SecurityLevel,
        rate_limit: &RateLimitInfo,
    ) -> Result<u64, ProgramError> {
        let base_reward = VALIDATOR_REWARD;
        
        // Adjust reward based on security level
        let security_multiplier = match security_level {
            SecurityLevel::Critical => 4,
            SecurityLevel::High => 3,
            SecurityLevel::Medium => 2,
            SecurityLevel::Low => 1,
        };

        // Apply dynamic rate limiting based on stake and request count
        let rate_factor = if u64::from(rate_limit.request_count) > rate_limit.total_stake {
            PENALTY_RATE
        } else {
            BASE_RATE
        };

        // Calculate final reward with rate limiting applied
        Ok((base_reward * security_multiplier as u64 * rate_factor) / BASE_RATE)
    }

    pub fn process_burn<'b>(
        amount: u64,
        token_account: &'b AccountInfo<'b>,
        mint_info: &'b AccountInfo<'b>,
    ) -> Result<(), ProgramError> {
        let burn_amount = (amount * BURN_RATE as u64) / 100;
        
        // Create burn instruction
        let burn_instruction = spl_token::instruction::burn(
            &spl_token::id(),
            token_account.key,
            mint_info.key,
            token_account.key,
            &[],
            burn_amount,
        )?;

        // Execute burn
        solana_program::program::invoke_signed(
            &burn_instruction,
            &[token_account.clone(), mint_info.clone()],
            &[],
        )?;

        Ok(())
    }

    pub fn freeze_tokens<'b>(
        token_account: &'b AccountInfo<'b>,
        mint_authority: &'b AccountInfo<'b>,
        duration: i64,
    ) -> Result<(), ProgramError> {
        // Create freeze instruction
        let freeze_instruction = freeze_account(
            &spl_token::id(),
            token_account.key,
            mint_authority.key,
            mint_authority.key,  // Use mint authority as freeze authority
            &[],
        )?;

        // Execute freeze
        solana_program::program::invoke_signed(
            &freeze_instruction,
            &[token_account.clone(), mint_authority.clone()],
            &[],
        )?;

        // Store freeze duration in account data
        let mut data = token_account.try_borrow_mut_data()?;
        let freeze_end = Clock::get()?.unix_timestamp + duration;
        data[0..8].copy_from_slice(&freeze_end.to_le_bytes());

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Clock;
    use solana_program::program_test;
    use solana_sdk::signature::Keypair;

    #[tokio::test]
    async fn test_token_operations() {
        let program_id = Pubkey::new_unique();
        let mint = Keypair::new();
        let authority = Keypair::new();
        let user = Keypair::new();

        let (mut banks_client, payer, recent_blockhash) = program_test().start().await;

        // Create mint account
        let rent = banks_client.get_rent().await.unwrap();
        let mint_rent = rent.minimum_balance(spl_token::state::Mint::LEN);

        let create_mint_ix = system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            mint_rent,
            spl_token::state::Mint::LEN as u64,
            &spl_token::id(),
        );

        let initialize_mint_ix = spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &mint.pubkey(),
            &authority.pubkey(),
            Some(&authority.pubkey()),
            6,
        ).unwrap();

        let transaction = solana_sdk::transaction::Transaction::new_signed_with_payer(
            &[create_mint_ix, initialize_mint_ix],
            Some(&payer.pubkey()),
            &[&payer, &mint],
            recent_blockhash,
        );

        banks_client.process_transaction(transaction).await.unwrap();

        // Test token operations
        let token_account = Keypair::new();
        let token_account_rent = rent.minimum_balance(spl_token::state::Account::LEN);

        let create_account_ix = system_instruction::create_account(
            &payer.pubkey(),
            &token_account.pubkey(),
            token_account_rent,
            spl_token::state::Account::LEN as u64,
            &spl_token::id(),
        );

        let initialize_account_ix = spl_token::instruction::initialize_account(
            &spl_token::id(),
            &token_account.pubkey(),
            &mint.pubkey(),
            &user.pubkey(),
        ).unwrap();

        let transaction = solana_sdk::transaction::Transaction::new_signed_with_payer(
            &[create_account_ix, initialize_account_ix],
            Some(&payer.pubkey()),
            &[&payer, &token_account],
            recent_blockhash,
        );

        banks_client.process_transaction(transaction).await.unwrap();

        // Verify account state
        let account = banks_client.get_account(token_account.pubkey()).await.unwrap().unwrap();
        let token_account_data = TokenAccount::unpack(&account.data).unwrap();
        assert_eq!(token_account_data.owner, user.pubkey());
        assert_eq!(token_account_data.mint, mint.pubkey());
        assert_eq!(token_account_data.amount, 0);
    }

    #[test]
    fn test_validate_stake_amount() {
        assert!(TokenManager::validate_stake_amount(MIN_STAKE_AMOUNT).is_ok());
        assert!(TokenManager::validate_stake_amount(MIN_STAKE_AMOUNT - 1).is_err());
    }

    #[test]
    fn test_calculate_validator_reward() {
        let rate_limit = RateLimitInfo {
            requests_processed: 0,
            max_requests: 100,
            window_size: 3600,
        };

        let reward = TokenManager::calculate_validator_reward(
            SecurityLevel::Critical,
            &rate_limit
        ).unwrap();

        assert_eq!(reward, VALIDATOR_REWARD * 4);
    }
}
