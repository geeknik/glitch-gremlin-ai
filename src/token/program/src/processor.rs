use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    msg,
    pubkey::Pubkey,
    program_pack::{Pack, IsInitialized},
    sysvar::{rent::Rent, Sysvar},
    system_instruction,
};
use crate::{instruction::GlitchInstruction, error::GlitchError, state::ChaosRequest};

pub struct Processor;

impl Processor {
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

        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Create the chaos request
        let chaos_request = ChaosRequest::new(
            *owner_info.key,
            amount,
            params,
        );

        // Verify account ownership
        if chaos_request_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Verify token account ownership
        if token_account_info.owner != &spl_token::id() {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // TODO: Add token transfer using spl_token
        // For demonstration, just create the request
        chaos_request.serialize(&mut *chaos_request_info.data.borrow_mut())?;
        
        Ok(())
    }

    fn process_finalize_chaos_request(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        status: u8,
        result_ref: String,
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
