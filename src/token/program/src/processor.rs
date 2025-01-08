use crate::state::RateLimitInfo;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    msg,
    pubkey::Pubkey,
    program_pack::Pack,
    sysvar::{rent::Rent, Sysvar},
    program::invoke,
    clock::Clock,
};
use borsh::{BorshSerialize, BorshDeserialize};
use spl_token::state::Account as TokenAccount;
use crate::{
    instruction::GlitchInstruction, 
    error::GlitchError, 
    state::ChaosRequest,
    governance::{GovernanceProposal, ProposalStatus},
};

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
            GlitchInstruction::CreateProposal { id, description, target_program, staked_amount, deadline } => {
                msg!("Instruction: Create Proposal");
                Self::process_create_proposal(program_id, accounts, id, description, target_program, staked_amount, deadline)
            }
            GlitchInstruction::Vote { proposal_id, vote_for, vote_amount } => {
                msg!("Instruction: Vote");
                Self::process_vote(program_id, accounts, proposal_id, vote_for, vote_amount)
            }
            GlitchInstruction::ExecuteProposal { proposal_id } => {
                msg!("Instruction: Execute Proposal");
                Self::process_execute_proposal(program_id, accounts, proposal_id)
            }
        }
    }

    fn process_create_proposal(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        id: u64,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposal_info = next_account_info(account_info_iter)?;
        let staking_info = next_account_info(account_info_iter)?;
        let proposer_info = next_account_info(account_info_iter)?;

        if !proposer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Validate accounts
        Self::validate_governance_account(proposal_info, program_id)?;
        Self::validate_token_account(staking_info, proposer_info.key)?;

        // Create and serialize the proposal
        let proposal = GovernanceProposal::new(
            id,
            *proposer_info.key,
            description,
            target_program,
            staked_amount,
            deadline,
        );
        proposal.serialize(&mut *proposal_info.data.borrow_mut())?;

        // Transfer staked tokens
        let transfer_ix = spl_token::instruction::transfer(
            staking_info.key,
            staking_info.key,
            proposal_info.key,
            proposer_info.key,
            &[],
            staked_amount,
        )?;

        invoke(
            &transfer_ix,
            &[
                staking_info.clone(),
                proposal_info.clone(),
                proposer_info.clone(),
            ],
        )?;

        msg!("Proposal created with ID {}", id);
        Ok(())
    }

    fn process_vote(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        proposal_id: u64,
        vote_for: bool,
        vote_amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposal_info = next_account_info(account_info_iter)?;
        let staking_info = next_account_info(account_info_iter)?;
        let voter_info = next_account_info(account_info_iter)?;

        if !voter_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Validate accounts
        Self::validate_governance_account(proposal_info, program_id)?;
        Self::validate_token_account(staking_info, voter_info.key)?;

        let mut proposal = GovernanceProposal::try_from_slice(&proposal_info.data.borrow())?;

        // Check if voting is still open
        let clock = Clock::get()?;
        if clock.unix_timestamp > proposal.deadline {
            return Err(ProgramError::InvalidArgument);
        }

        // Update vote counts
        if vote_for {
            proposal.votes_for += vote_amount;
        } else {
            proposal.votes_against += vote_amount;
        }

        proposal.serialize(&mut *proposal_info.data.borrow_mut())?;

        msg!("Vote recorded for proposal {}", proposal_id);
        Ok(())
    }

    fn process_execute_proposal(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        proposal_id: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposal_info = next_account_info(account_info_iter)?;
        
        // Validate proposal account
        Self::validate_governance_account(proposal_info, program_id)?;
        let account_info_iter = &mut accounts.iter();
        let proposal_info = next_account_info(account_info_iter)?;
        let executor_info = next_account_info(account_info_iter)?;

        if !executor_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let mut proposal = GovernanceProposal::try_from_slice(&proposal_info.data.borrow())?;

        // Check if proposal is approved
        if proposal.status != ProposalStatus::Approved {
            return Err(ProgramError::InvalidArgument);
        }

        // TODO: Implement actual proposal execution logic
        // This would include:
        // 1. Creating chaos request
        // 2. Transferring funds
        // 3. Updating proposal status

        proposal.status = ProposalStatus::Executed;
        proposal.serialize(&mut *proposal_info.data.borrow_mut())?;

        msg!("Proposal {} executed", proposal_id);
        Ok(())
    }

    fn validate_governance_account(
        account_info: &AccountInfo,
        program_id: &Pubkey,
    ) -> ProgramResult {
        if account_info.owner != program_id {
            return Err(ProgramError::InvalidAccountOwner);
        }

        // Verify account is rent exempt
        let rent = Rent::get()?;
        if !rent.is_exempt(account_info.lamports(), account_info.data_len()) {
            return Err(ProgramError::AccountNotRentExempt);
        }

        Ok(())
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
            *escrow_account.key,
            RateLimitInfo {
                last_request: 0,
                request_count: 0,
                window_start: 0,
            },
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
        program_id: &Pubkey,
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
        chaos_request.result_ref = String::from_utf8(result_ref).map_err(|_| GlitchError::InvalidChaosRequest)?;

        chaos_request.serialize(&mut *chaos_request_info.data.borrow_mut())?;

        Ok(())
    }
}
