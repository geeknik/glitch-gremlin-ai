use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    msg,
    pubkey::Pubkey,
    program_pack::Pack,
    sysvar::{rent::Rent, Sysvar},
    program::invoke,
};
use borsh::{BorshSerialize, BorshDeserialize};
use spl_token::state::Account as TokenAccount;
use crate::{instruction::GlitchInstruction, error::GlitchError, state::ChaosRequest};

pub struct Processor;

impl Processor {
    fn validate_token_account(
        token_account_info: &AccountInfo,
        owner_key: &Pubkey,
    ) -> ProgramResult {
        let token_account = TokenAccount::unpack(&token_account_info.data.borrow())?;
        
        if token_account.owner != *owner_key {
            return Err(GlitchError::InvalidAccountOwner.into());
        }
        
        if token_account.delegate.is_some() {
            return Err(GlitchError::InvalidAccountOwner.into()); 
        }

        Ok(())
    }

    fn validate_chaos_request(
        chaos_request_info: &AccountInfo,
        program_id: &Pubkey,
    ) -> ProgramResult {
        if chaos_request_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Verify account is rent exempt
        let rent = Rent::get()?;
        if !rent.is_exempt(chaos_request_info.lamports(), chaos_request_info.data_len()) {
            return Err(ProgramError::AccountNotRentExempt);
        }

        Ok(())
    }
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = GlitchInstruction::unpack(instruction_data)?;

        match instruction {
            GlitchInstruction::InitializeChaosRequest { amount, params } => {
                msg!("Instruction: Initialize Chaos Request");
                Self::process_initialize_chaos_request(program_id, accounts, amount, params)
            }
            GlitchInstruction::FinalizeChaosRequest { status, result_ref } => {
                msg!("Instruction: Finalize Chaos Request");
                Self::process_finalize_chaos_request(program_id, accounts, status, result_ref)
            }
        }
    }

    fn process_initialize_chaos_request(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        params: Vec<u8>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let chaos_request_info = next_account_info(account_info_iter)?;
        let token_account_info = next_account_info(account_info_iter)?;
        let owner_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;

        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Validate accounts
        Self::validate_chaos_request(chaos_request_info, program_id)?;
        Self::validate_token_account(token_account_info, owner_info.key)?;

        // Create and serialize the chaos request
        let chaos_request = ChaosRequest::new(
            *owner_info.key,
            amount,
            params,
        );
        chaos_request.serialize(&mut *chaos_request_info.data.borrow_mut())?;

        // Transfer tokens to escrow
        let transfer_ix = spl_token::instruction::transfer(
            token_program.key,
            token_account_info.key,
            escrow_account.key,
            owner_info.key,
            &[],
            amount,
        )?;

        invoke(
            &transfer_ix,
            &[
                token_account_info.clone(),
                escrow_account.clone(),
                owner_info.clone(),
                token_program.clone(),
            ],
        )?;
        
        msg!("Chaos request initialized with amount {}", amount);
        Ok(())
    }

    fn process_finalize_chaos_request(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        status: u8,
        result_ref: Vec<u8>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let chaos_request_info = next_account_info(account_info_iter)?;
        let finalizer_info = next_account_info(account_info_iter)?;

        if !finalizer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // TODO: Add verification that finalizer is authorized

        let mut chaos_request = ChaosRequest::try_from_slice(&chaos_request_info.data.borrow())?;
        chaos_request.status = status;
        chaos_request.result_ref = result_ref;

        chaos_request.serialize(&mut *chaos_request_info.data.borrow_mut())?;

        Ok(())
    }
}
