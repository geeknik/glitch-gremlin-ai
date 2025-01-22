use crate::state::RateLimitInfo;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    msg,
    pubkey::Pubkey,
    program_pack::Pack,
    sysvar::{rent::Rent, Sysvar},
    program::{invoke, invoke_signed},
    clock::Clock,
};
use crate::zk;
use crate::token_manager::TokenManager;
use crate::state::RateLimitConfig;
use borsh::{BorshSerialize, BorshDeserialize};
use spl_token::state::Account as TokenAccount;
use std::str::FromStr;
use crate::{
    instruction::GlitchInstruction, 
    error::GlitchError, 
    state::ChaosRequest,
    governance::{GovernanceProposal, ProposalStatus, TestParams},
};

#[derive(Debug, strum::Display, strum::EnumString, PartialEq)]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum TestType {
    #[strum(serialize = "EXPLOIT")]
    Exploit,
    #[strum(serialize = "FUZZ")]
    Fuzz,
    #[strum(serialize = "LOAD")]
    Load,
    #[strum(serialize = "CONCURRENCY")]
    Concurrency,
    #[strum(serialize = "MUTATION")]
    Mutation,
}

pub struct Processor;

impl Processor {
    /// Validate target program against banned list
    fn validate_target_program(params: &str) -> ProgramResult {
        let banned_programs = vec![
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
            "11111111111111111111111111111111", // System Program
            "Stake11111111111111111111111111111111111111",
            "Sysvar1111111111111111111111111111111111111", // Sysvar
            "Vote111111111111111111111111111111111111111", // Vote Program
            "Config1111111111111111111111111111111111111", // Config Program
        ];
        
        if banned_programs.iter().any(|&p| params.contains(p)) {
            return Err(GlitchError::InvalidTargetProgram.into());
        }
        Ok(())
    }

    /// Validate human proof using simple nonce challenge
    fn validate_human_proof(proof_account: &AccountInfo) -> bool {
        // Implementation would verify a ZK proof or CAPTCHA
        // For now just check account is initialized
        proof_account.data_len() > 0
    }

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
                Self::process_create_proposal(
                    program_id,
                    accounts,
                    id,
                    description.clone(),
                    target_program,
                    staked_amount,
                    deadline,
                    &RateLimitConfig::default(),
                    TestParams {
                        quorum: 0,
                        execution_time: 0,
                        test_type: String::new(),
                        duration: 0,
                        intensity: 0,
                        concurrency_level: 0,
                        max_latency: 0,
                        error_threshold: 0,
                        security_level: 0,
                        execution_delay: 0
                    }
                )
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
        config: &RateLimitConfig,
        params: TestParams,
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
        // Validate minimum stake (DESIGN.md 9.3)
        if staked_amount < config.min_stake_amount {
            return Err(GlitchError::InvalidStakeAmount.into());
        }

        // Set security level based on test type (DESIGN.md 9.3)
        let test_type = TestType::from_str(&params.test_type).map_err(|_| GlitchError::InvalidProposal)?;
        let security_level = match test_type {
            TestType::Exploit => 2, // High risk
            TestType::Concurrency => 1,
            TestType::Load => 1,
            TestType::Fuzz => 0,
            TestType::Mutation => 2,
            _ => 0
        };

        // Set execution delay (DESIGN.md 9.3)
        // From DESIGN.md 9.3 - Time-locked execution
        let execution_delay = match security_level {
            2 => 86400 * 7, // 1 week for critical systems
            1 => 86400,     // 24 hours for high risk
            _ => 3600       // 1 hour default
        };

        let test_params = TestParams {
            test_type: test_type.to_string(),
            duration: 300,
            intensity: 5,
            error_threshold: 2,
            security_level,
            quorum: 0,
            execution_time: 0,
            execution_delay: 0,
            max_latency: 1000,
            concurrency_level: 0,
            window_size: 0,
            z_score_threshold: 0.0,
            min_sample_size: 0,
            sensitivity_level: 0,
            adaptive_threshold: false,
            seasonality_period: 0,
            input_size: 0,
            anomaly_threshold: 0.0,
            time_steps: 0,
            // Kernel-level protections from DESIGN.md 9.6.3
            entropy_checks: true,
            memory_safety: 2,
            syscall_filter: vec!["seccomp".into(), "landlock".into()],
            page_quarantine: true,
            // Add kernel-level protections from DESIGN.md 9.6.3
            entropy_checks: true,      // DESIGN.md 9.6.1 μArch fingerprinting
            memory_safety: 2,         // DESIGN.md 9.6.4 MIRI checks + memory quarantine
            syscall_filter: vec![
                "seccomp".into(),     // DESIGN.md 9.6.3 seccomp-bpf filters
                "landlock".into()     // Landlock namespacing
            ],
            page_quarantine: true     // 64ms hold period
        };

        let proposal = GovernanceProposal::new(
            id,
            *proposer_info.key,
            description,
            target_program,
            staked_amount,
            deadline,
            test_params,
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
        program_id: &Pubkey,
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

        // Check if proposal meets quorum and delay (DESIGN.md 9.1)
        let clock = Clock::get()?;
        let total_votes = proposal.votes_for + proposal.votes_against;
        
        // Validate proposal status and quorum (DESIGN.md 9.3)
        if proposal.status != ProposalStatus::Approved {
            return Err(GlitchError::ProposalNotApproved.into());
        }
        
        if total_votes < proposal.quorum {
            return Err(GlitchError::QuorumNotReached.into());
        }
        
        if clock.unix_timestamp < proposal.execution_time {
            return Err(GlitchError::ExecutionDelayNotMet.into());
        }
        
        // Enforce 7/10 multisig with 72-hour delay for high-risk proposals (DESIGN.md 9.1)
        if proposal.security_level >= 2 {
            // Verify at least 7 signatures from authorized multisig signers
            let sig_count = proposal.multisig_signers.iter()
                .filter(|pubkey| accounts.iter().any(|acc| acc.is_signer && acc.key == **pubkey))
                .count();
            
            if sig_count < 7 || proposal.required_signatures < 7 {
                return Err(GlitchError::InsufficientMultisigSignatures.into());
            }
            
            // Enforce 72-hour delay
            if clock.unix_timestamp < proposal.execution_time + 259200 { // 72*3600
                return Err(GlitchError::ExecutionDelayNotMet.into());
            }
        }

        // Get treasury account and validate
        let treasury_info = next_account_info(account_info_iter)?;
        Self::validate_token_account(treasury_info, program_id)?;

        // Create chaos request from proposal parameters
        let chaos_request = ChaosRequest {
            owner: *executor_info.key,
            amount: proposal.staked_amount,
            status: 0, // Pending
            params: proposal.test_params.try_to_vec()?,
            result_ref: String::new(),
            escrow_account: *treasury_info.key,
            rate_limit: RateLimitInfo::default(),
            created_at: clock.unix_timestamp,
            completed_at: 0,
        };

        // Initialize chaos request
        let chaos_request_signer_seeds = &[
            &[b"chaos_request", &proposal.id.to_le_bytes()],
            &[proposal.id as u8],
        ];
        let chaos_request_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        chaos_request.serialize(&mut *chaos_request_info.data.borrow_mut())?;

        // Transfer funds from treasury to escrow
        let transfer_ix = spl_token::instruction::transfer(
            token_program.key,
            treasury_info.key,
            chaos_request_info.key,
            &spl_token::ID,
            &[],
            proposal.staked_amount,
        )?;
        invoke_signed(
            &transfer_ix,
            &[
                treasury_info.clone(),
                chaos_request_info.clone(),
                token_program.clone(),
            ],
            &[&[
                b"chaos_request", 
                &proposal.id.to_le_bytes(),
                &[proposal.id as u8]
            ]],
        )?;

        // Update proposal status and store chaos request reference
        proposal.status = ProposalStatus::Executed;
        proposal.executed_at = clock.unix_timestamp;
        proposal.chaos_request = Some(*chaos_request_info.key);
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
        mut amount: u64,
        params: Vec<u8>,
    ) -> ProgramResult {
        // Validate target program is not banned
        let params_str = String::from_utf8(params.clone()).map_err(|_| GlitchError::InvalidChaosRequest)?;
        Self::validate_target_program(&params_str)?;

        // Apply dynamic pricing formula: base_fee * e^(requests_per_hour/15)
        let clock = Clock::get()?;
        let mut rate_limit_info = RateLimitInfo::try_from_slice(&accounts[3].data.borrow())?;
        let requests_per_hour = rate_limit_info.request_count * 60;
        let exponent = (requests_per_hour as f32) / 15.0;
        let dynamic_multiplier = exponent.exp();
        
        // Calculate amount with overflow protection
        amount = amount.checked_mul(dynamic_multiplier as u64)
            .and_then(|v| v.checked_add(1)) // Ensure minimum 1 token
            .ok_or(GlitchError::ArithmeticOverflow)?;

        // Burn 10% if in high-frequency mode (ex > 1.0)
        if exponent > 1.0 {
            let burn_amount = amount.checked_div(10).ok_or(GlitchError::ArithmeticOverflow)?;
            amount = amount.checked_sub(burn_amount).ok_or(GlitchError::ArithmeticOverflow)?;
            TokenManager::burn_tokens(&accounts[1], burn_amount)?;
        }

        // State-contingent throttling
        if rate_limit_info.failed_requests > 5 {
            // Burn 10% of tokens if too many failures
            let burn_amount = amount / 10;
            amount = amount.checked_sub(burn_amount)
                .ok_or(GlitchError::ArithmeticOverflow)?;
            TokenManager::burn_tokens(&accounts[1], burn_amount)?;
            
            // Require human verification
            let proof_account = next_account_info(&mut accounts.iter())?;
            if !Self::validate_human_proof(proof_account) {
                return Err(GlitchError::HumanVerificationRequired.into());
            }
        }
        
        // Check minimum interval
        if clock.unix_timestamp - rate_limit_info.last_request < rate_limit_info.min_interval {
            return Err(GlitchError::RateLimitExceeded.into());
        }
        
        // Check window limits using config values
        if clock.unix_timestamp - rate_limit_info.window_start < rate_limit_info.window_duration {
            if rate_limit_info.request_count >= rate_limit_info.max_requests {
                return Err(GlitchError::RateLimitExceeded.into());
            }
        } else {
            // Reset window
            rate_limit_info.window_start = clock.unix_timestamp;
            rate_limit_info.request_count = 0;
        }
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
        let clock = Clock::get()?;
        let chaos_request = ChaosRequest::new(
            *owner_info.key,
            amount,
            params,
            *escrow_account.key,
            RateLimitInfo {
                last_request: clock.unix_timestamp,
                request_count: 0,
                window_start: clock.unix_timestamp,
                failed_requests: 0,
                human_proof_nonce: [0; 32],
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

        // Verify finalizer is authorized AI engine
        let expected_finalizer = Pubkey::create_program_address(
            &[b"ai_engine", &chaos_request_info.key.to_bytes()],
            program_id,
        )?;
        if finalizer_info.key != &expected_finalizer {
            return Err(GlitchError::InvalidFinalizer.into());
        }

        let mut chaos_request = ChaosRequest::try_from_slice(&chaos_request_info.data.borrow())?;
        
        // Validate result proof using ZK-SNARKs verification
        let proof_account = next_account_info(account_info_iter)?;
        let proof_data = proof_account.data.borrow();
        let public_inputs = chaos_request.params.clone();
        
        // Verify proof with Groth16 and check certificate transparency logs (DESIGN.md 9.6.2)
        let proof_valid = crate::zk::verify_groth16(
            &proof_data[..zk::GROTH16_PROOF_SIZE],
            &public_inputs,
            zk::VK
        )?;
        
        // Check certificate transparency logs
        let cert_logs_account = next_account_info(account_info_iter)?;
        let cert_logs = CertificateLogs::try_from_slice(&cert_logs_account.data.borrow())?;
        let log_valid = cert_logs.verify_quarterly_entries(clock.unix_timestamp);
        
        if !(proof_valid && log_valid) {
            return Err(GlitchError::InvalidCompletionProof.into());
        }

        // Enforce slashing conditions from DESIGN.md 9.3
        if status == 3 { // Failed status
            // Slash 50% of staked tokens for failed requests
            let slash_amount = chaos_request.amount * 50 / 100;
            let escrow_account_info = next_account_info(account_info_iter)?;
            TokenManager::burn_tokens(escrow_account_info, slash_amount)?;
            chaos_request.amount -= slash_amount;
            msg!("Slashed {} tokens for failed test", slash_amount);
        }

        // Apply tokenomics (70% burn, 30% insurance) from DESIGN.md 9.1
        let burn_amount = chaos_request.amount * 70 / 100;
        let escrow_account_info = next_account_info(account_info_iter)?;
        if escrow_account_info.key != &chaos_request.escrow_account {
            return Err(ProgramError::InvalidArgument);
        }
        TokenManager::burn_tokens(escrow_account_info, burn_amount)?;

        // Calculate insurance amount as 30% of original amount (DESIGN.md 9.1)
        let insurance_amount = chaos_request.amount.checked_mul(30)
            .and_then(|v| v.checked_div(100))
            .ok_or(GlitchError::ArithmeticOverflow)?;
        let insurance_account = next_account_info(account_info_iter)?;
        TokenManager::transfer_tokens(
            chaos_request_info,
            insurance_account.key,
            insurance_amount,
        )?;
        chaos_request.status = status;
        chaos_request.result_ref = String::from_utf8(result_ref).map_err(|_| GlitchError::InvalidChaosRequest)?;

        chaos_request.serialize(&mut *chaos_request_info.data.borrow_mut())?;

        Ok(())
    }
}
