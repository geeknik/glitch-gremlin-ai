use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    msg,
    pubkey::Pubkey,
    program_pack::Pack,
    sysvar::{rent::Rent, clock::Clock, Sysvar},
    bpf_loader_upgradeable,
};
use crate::{
    error::GlitchError,
    instruction::{GlitchInstruction, TestParams},
    state::{ChaosRequest, ChaosRequestStatus, SecurityLevel, RateLimitInfo},
    token_manager::TokenManager,
    zk::ZkVerifier,
    governance::{ProposalStatus, VoteCounts, Proposal, GovernanceConfig, VoteType},
};
use borsh::BorshDeserialize;
use spl_token::state::Account as TokenAccount;
use crystals_dilithium::sign::lvl2::verify;

pub const SGX_PREFIX: [u8; 4] = [0x53, 0x47, 0x58, 0x21]; // "SGX!"

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

/// Security constants from DESIGN.md 9.1
const BURN_PERCENTAGE: u8 = 70;
const INSURANCE_PERCENTAGE: u8 = 30;
const MIN_SIGNATURES: u8 = 7;
const EXECUTION_DELAY: i64 = 259200; // 72 hours in seconds
// Security constants from DESIGN.md 9.1 and 9.6.2
const HUMAN_PROOF_NONCE_SIZE: usize = 8;
const MIN_GEO_REGIONS: usize = 3;

pub const MULTISIG_SIGNERS: [&str; 3] = [
    "MSig111111111111111111111111111111111111111",
    "MSig222222222222222222222222222222222222222",
    "MSig333333333333333333333333333333333333333"
];

impl Processor {
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
    fn validate_human_proof(&self, proof_account: &AccountInfo) -> ProgramResult {
        let proof_data = proof_account.data.borrow();
        if proof_data.len() != HUMAN_PROOF_NONCE_SIZE {
            return Err(GlitchError::InvalidProof.into());
        }
        
        let nonce = &proof_data[..HUMAN_PROOF_NONCE_SIZE];
        let mut entropy_buffer = [0u8; 32];
        solana_program::hash::hash(&proof_account.data.borrow()).to_bytes().copy_from_slice(&mut entropy_buffer);
        
        if nonce != &entropy_buffer[..HUMAN_PROOF_NONCE_SIZE] {
            return Err(GlitchError::InvalidProof.into());
        }
        
        Ok(())
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
    /// Validate program initialization state
    #[inline(never)]
    fn validate_initialized(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        // DESIGN.md 9.6.4 Memory Safety
        unsafe {
            // Memory barrier and speculative execution barrier in a single unsafe block
            std::arch::asm!("mfence", "lfence");
        }
        
        // Check if program data account exists and is owned by BPF loader
        let program_data = next_account_info(&mut accounts.iter())?;
        if program_data.owner != &bpf_loader_upgradeable::id() {
            return Err(ProgramError::InvalidAccountOwner);
        }
        
        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting
        let mut entropy_buffer = [0u8; 32];
        solana_program::hash::hash(&program_data.data.borrow()).to_bytes().copy_from_slice(&mut entropy_buffer);
        if entropy_buffer[0] & 0xF0 != SGX_PREFIX[0] & 0xF0 {
            msg!("Invalid entropy pattern");
            return Err(GlitchError::InvalidProof.into());
        }

        Ok(())
    }

    pub fn process_instruction<'a>(
        program_id: &Pubkey,
        accounts: &'a [AccountInfo<'a>],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = GlitchInstruction::unpack(instruction_data)
            .map_err(|_| GlitchError::InvalidInstruction)?;

        match instruction {
            GlitchInstruction::InitializeRequest {
                amount,
                test_params,
                security_level,
                attestation_required: _,
            } => {
                msg!("Processing initialize request");
                Self::process_initialize_request(program_id, accounts, amount, test_params.into(), security_level)
            }
            GlitchInstruction::CreateProposal {
                id,
                description,
                target_program,
                staked_amount,
                deadline,
                test_params,
            } => {
                msg!("Processing create proposal");
                Self::process_create_proposal(
                    program_id,
                    accounts,
                    id,
                    description,
                    target_program,
                    staked_amount,
                    deadline,
                    &RateLimitInfo::default(),
                    test_params.into(),
                )
            }
            GlitchInstruction::Vote {
                proposal_id,
                vote_for,
                vote_amount,
            } => {
                msg!("Processing vote");
                Self::process_vote(
                    program_id,
                    accounts,
                    proposal_id,
                    vote_for,
                    vote_amount,
                )
            }
            GlitchInstruction::ExecuteProposal {
                proposal_id,
                multisig_signatures,
                geographic_proofs,
            } => {
                msg!("Processing execute proposal");
                Self::process_execute_proposal(
                    program_id,
                    accounts,
                    proposal_id,
                    multisig_signatures,
                    geographic_proofs,
                )
            }
            GlitchInstruction::SubmitTestResults {
                request_id,
                results,
                validator_signature,
                geographic_proof,
            } => {
                msg!("Processing submit test results");
                Self::process_submit_test_results(
                    program_id,
                    accounts,
                    request_id,
                    results,
                    validator_signature,
                    geographic_proof,
                )
            }
            GlitchInstruction::UpdateTestParams { new_params } => {
                msg!("Processing update test params");
                Self::process_update_test_params(program_id, accounts, new_params.into())
            }
            GlitchInstruction::EmergencyPause { reason } => {
                msg!("Processing emergency pause");
                Self::process_emergency_pause(program_id, accounts, reason)
            }
            GlitchInstruction::EmergencyResume { reason } => {
                msg!("Processing emergency resume");
                Self::process_emergency_resume(program_id, accounts, reason)
            }
            GlitchInstruction::FinalizeChaosRequest {
                status,
                validator_signatures,
                geographic_proofs,
                attestation_proof,
                sgx_quote,
                performance_metrics,
            } => {
                msg!("Processing finalize chaos request");
                Self::process_finalize_request(
                    program_id,
                    accounts,
                    status,
                    validator_signatures,
                    geographic_proofs,
                    attestation_proof,
                    sgx_quote,
                    performance_metrics,
                )
            }
        }
    }

    pub fn process_create_proposal<'a>(
        _program_id: &Pubkey,
        accounts: &'a [AccountInfo<'a>],
        id: u64,
        description: String,
        target_program: Pubkey,
        staked_amount: u64,
        deadline: i64,
        _rate_limit: &RateLimitInfo,
        test_params: TestParams,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposer_info = next_account_info(account_info_iter)?;
        let proposal_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;

        if !proposer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let proposal = Proposal {
            id,
            proposer: *proposer_info.key,
            title: String::new(),
            description,
            target_program,
            status: ProposalStatus::Active,
            vote_counts: VoteCounts::default(),
            voting_ends_at: current_time + deadline,
            executed_at: None,
            escrow_account: *escrow_info.key,
            test_params: test_params.into(),
            execution_delay: EXECUTION_DELAY,
            quorum: 7,
            security_level: SecurityLevel::High,
            multisig_signers: Vec::new(),
            required_signatures: MIN_SIGNATURES,
            created_at: current_time,
            voting_starts_at: current_time,
            expires_at: current_time + deadline,
            staked_amount: staked_amount,
        };

        proposal.pack_into_slice(&mut proposal_info.data.borrow_mut());

        let token_manager = TokenManager::new(
            next_account_info(account_info_iter)?,
            next_account_info(account_info_iter)?,
            next_account_info(account_info_iter)?,
        );

        token_manager.escrow_tokens(
            proposer_info,
            escrow_info,
            proposer_info,
            staked_amount,
            SecurityLevel::High,
        )?;

        Ok(())
    }

    pub fn process_vote(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        _proposal_id: u64,
        vote_for: bool,
        vote_amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let voter_info = next_account_info(account_info_iter)?;
        let proposal_info = next_account_info(account_info_iter)?;

        if !voter_info.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        let mut proposal = Proposal::unpack_from_slice(&proposal_info.data.borrow())?;

        if proposal.id != _proposal_id {
            return Err(GlitchError::InvalidRequest.into());
        }

        // Update vote counts
        if vote_for {
            proposal.vote_counts.yes += vote_amount;
        } else {
            proposal.vote_counts.no += vote_amount;
        }

        proposal.pack_into_slice(&mut proposal_info.data.borrow_mut());

        Ok(())
    }

    pub fn process_execute_proposal(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        proposal_id: u64,
        multisig_signatures: Vec<[u8; 64]>,
        geographic_proofs: Vec<Vec<u8>>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let proposal_info = next_account_info(account_info_iter)?;
        let executor_info = next_account_info(account_info_iter)?;

        if !executor_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        if proposal_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Verify signatures
        for signature in multisig_signatures.iter() {
            if !ZkVerifier::verify_signature(signature, executor_info.key)? {
                return Err(GlitchError::InvalidSignature.into());
            }
        }

        // Verify geographic proofs
        for proof in geographic_proofs.iter() {
            if !ZkVerifier::verify_geographic_proof(proof, executor_info.key)? {
                return Err(GlitchError::InvalidGeographicProof.into());
            }
        }

        Ok(())
    }

    pub fn process_submit_test_results(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        _request_id: u64,
        _results: Vec<u8>,
        validator_signature: [u8; 64],
        geographic_proof: Vec<u8>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let validator_info = next_account_info(account_info_iter)?;
        let request_info = next_account_info(account_info_iter)?;

        if !validator_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify validator signature
        if !ZkVerifier::verify_signature(&validator_signature, validator_info.key)? {
            return Err(GlitchError::InvalidSignature.into());
        }

        // Verify geographic proof
        if !ZkVerifier::verify_geographic_proof(&geographic_proof, validator_info.key)? {
            return Err(GlitchError::InvalidGeographicProof.into());
        }

        Ok(())
    }

    pub fn process_update_test_params(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        new_params: TestParams,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;

        if !authority_info.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        if authority_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Validate new parameters
        if new_params.max_duration_seconds > 3600 || new_params.max_duration_seconds < 60 {
            return Err(GlitchError::InvalidChaosParameters.into());
        }

        if new_params.min_validators < 1 || new_params.min_validators > 10 {
            return Err(GlitchError::InvalidChaosParameters.into());
        }

        Ok(())
    }

    pub fn process_emergency_pause(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        reason: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let program_info = next_account_info(account_info_iter)?;

        if !authority_info.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        if program_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Set program status to paused
        let mut program_data = program_info.data.borrow_mut();
        program_data[0] = 0; // 0 = paused

        msg!("Program paused: {}", reason);
        Ok(())
    }

    pub fn process_emergency_resume(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        reason: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let program_info = next_account_info(account_info_iter)?;

        if !authority_info.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        if program_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        // Set program status to active
        let mut program_data = program_info.data.borrow_mut();
        program_data[0] = 1; // 1 = active

        msg!("Program resumed: {}", reason);
        Ok(())
    }

    pub fn process_finalize_request(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        status: u8,
        validator_signatures: Vec<[u8; 64]>,
        geographic_proofs: Vec<Vec<u8>>,
        attestation_proof: Option<Vec<u8>>,
        sgx_quote: Option<Vec<u8>>,
        performance_metrics: Option<Vec<u8>>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let chaos_request_info = next_account_info(account_info_iter)?;
        let validator_info = next_account_info(account_info_iter)?;

        if !validator_info.is_signer {
            return Err(GlitchError::InvalidSignature.into());
        }

        if chaos_request_info.owner != program_id {
            return Err(GlitchError::InvalidAccountOwner.into());
        }

        let mut chaos_request = ChaosRequest::unpack_from_slice(&chaos_request_info.data.borrow())?;

        // Validate signatures and proofs
        for signature in validator_signatures.iter() {
            if !ZkVerifier::verify_signature(signature, validator_info.key)? {
                return Err(GlitchError::InvalidSignature.into());
            }
        }

        for proof in geographic_proofs.iter() {
            if !ZkVerifier::verify_geographic_proof(proof, validator_info.key)? {
                return Err(GlitchError::InvalidGeographicProof.into());
            }
        }

        if let Some(attestation_data) = attestation_proof.as_ref() {
            if !ZkVerifier::verify_attestation(attestation_data, validator_info.key)? {
                return Err(GlitchError::InvalidAttestation.into());
            }
        }

        if let Some(quote_data) = sgx_quote.as_ref() {
            if !ZkVerifier::verify_sgx_quote(quote_data)? {
                return Err(GlitchError::InvalidSGXQuote.into());
            }
        }

        chaos_request.status = ChaosRequestStatus::try_from(status)
            .map_err(|_| GlitchError::InvalidRequestStatus)?;
        chaos_request.validator_signatures = validator_signatures;
        chaos_request.geographic_proofs = geographic_proofs;
        chaos_request.attestation_proof = attestation_proof;
        chaos_request.sgx_quote = sgx_quote;
        chaos_request.performance_metrics = performance_metrics;

        // Update chaos request
        chaos_request.pack_into_slice(&mut chaos_request_info.data.borrow_mut());
        Ok(())
    }

    fn validate_performance_metrics(metrics: &[u8]) -> bool {
        if metrics.len() < 8 {
            return false;
        }

        // Basic validation - check for expected header
        metrics.starts_with(b"PERF_MTR")
    }

    pub fn process_initialize_request(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        test_params: TestParams,
        security_level: SecurityLevel,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let owner_info = next_account_info(account_info_iter)?;
        let target_program_info = next_account_info(account_info_iter)?;
        let chaos_request_info = next_account_info(account_info_iter)?;
        let escrow_account_info = next_account_info(account_info_iter)?;

        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let chaos_request = ChaosRequest::new(
            0,
            *owner_info.key,
            *target_program_info.key,
            amount,
            security_level,
            test_params.into(),
            Clock::get()?.unix_timestamp,
            *escrow_account_info.key,
        );

        chaos_request.pack_into_slice(&mut chaos_request_info.data.borrow_mut());
        Ok(())
    }

    fn validate_security_requirements(request: &ChaosRequest) -> ProgramResult {
        match request.security_level {
            SecurityLevel::Critical | SecurityLevel::High => {
                if !request.test_params.memory_fence_required {
                    return Err(GlitchError::MemorySafetyViolation.into());
                }
                if !request.test_params.entropy_checks {
                    return Err(GlitchError::InvalidEntropyPattern.into());
                }
            }
            SecurityLevel::Medium | SecurityLevel::Low => {}
        }
        Ok(())
    }

    pub fn process_execute_test(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let chaos_request_info = next_account_info(account_info_iter)?;
        let _request_data = ChaosRequest::try_from_slice(&chaos_request_info.data.borrow())?;
        let validator_info = next_account_info(account_info_iter)?;

        // Security-critical validation remains
        if !validator_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(())
    }

    fn validate_attestation(accounts: &[AccountInfo]) -> ProgramResult {
        let attestation_info = next_account_info(&mut accounts.iter())?;
        let attestation_data = attestation_info.data.borrow();
        
        // Verify SGX quote using ZkVerifier
        if !ZkVerifier::verify_sgx_quote(&attestation_data)? {
            return Err(GlitchError::InvalidAttestation.into());
        }
        
        Ok(())
    }

    fn validate_hardware_security(accounts: &[AccountInfo]) -> ProgramResult {
        let attestation_info = next_account_info(&mut accounts.iter())?;
        
        // Verify SGX quote
        if !ZkVerifier::verify_sgx_quote(&attestation_info.data.borrow())
            .map_err(|_| GlitchError::InvalidAttestation)? {
            return Err(GlitchError::InvalidAttestation.into());
        }
        
        Ok(())
    }

    fn verify_emergency_signature(authority_info: &AccountInfo, signature: &[u8; 64]) -> bool {
        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting
        let mut entropy_buffer = [0u8; 32];
        solana_program::hash::hash(&authority_info.key.to_bytes()).to_bytes().copy_from_slice(&mut entropy_buffer);
        
        if entropy_buffer[0] & 0xF0 != 0x90 {
            return false;
        }

        // Verify signature using crystals-dilithium
        let message = b"EMERGENCY_ACTION";
        verify(signature, message, authority_info.key.as_ref())
    }

    pub fn process_update_params(
        _program_id: &Pubkey,
        _accounts: &[AccountInfo],
        _new_params: TestParams,
    ) -> ProgramResult {
        Ok(())
    }

    pub fn process_emergency_halt(
        _program_id: &Pubkey,
        _accounts: &[AccountInfo],
        _reason: String,
    ) -> ProgramResult {
        Ok(())
    }

    pub fn process_claim_tokens(
        _program_id: &Pubkey,
        _accounts: &[AccountInfo],
    ) -> ProgramResult {
        Ok(())
    }
}

pub fn get_upgrade_authority(program_data: &AccountInfo) -> Result<Pubkey, ProgramError> {
    // Read the upgrade authority from program data account
    let data = program_data.data.borrow();
    if data.len() < 13 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut authority = [0u8; 32];
    authority.copy_from_slice(&data[5..37]);
    Pubkey::try_from(&authority[..]).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn get_last_upgrade_time(program_data: &AccountInfo) -> Result<i64, ProgramError> {
    let data = program_data.data.borrow();
    if data.len() < 13 {
        return Err(ProgramError::InvalidAccountData);
    }
    
    let timestamp = i64::from_le_bytes(data[5..13].try_into().unwrap());
    Ok(timestamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialize_request() {
        // TODO: Add test implementation
    }

    #[test]
    fn test_finalize_request() {
        // TODO: Add test implementation
    }
}
