use std::str::FromStr;
use solana_program_test::*;
use solana_sdk::{
    hash::Hash,
    pubkey::Pubkey, 
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token;
use crate::processor::process_instruction;
use solana_program::pubkey::Pubkey;
use solana_program::system_instruction;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    sysvar::{clock::Clock, Sysvar},
    rent::Rent,
    system_program,
};
use std::cell::RefCell;
use std::rc::Rc;

use crate::{
    ChaosRequest,
    SecurityLevel,
    ValidationMode,
    error::SecurityError,
};

use crate::error::{ValidationError, WorkerError};

// Program ID for tests (matches DESIGN.md 9.1 deployment address)
pub fn id() -> Pubkey {
    Pubkey::from_str("GGremN5xG5gx3VQ8CqpVX1EdfxQt5u4ij1fF8GGR8zf").unwrap()
}

// Test account constants from DESIGN.md 9.1
pub const ALICE: Pubkey = Pubkey::new_from_array([1; 32]);
pub const BOB: Pubkey = Pubkey::new_from_array([2; 32]);

#[cfg(test)]
pub struct TestContext {
    pub payer: Keypair,
    pub last_blockhash: solana_program::hash::Hash,
}

#[cfg(test)]
impl TestContext {
    pub fn new() -> Self {
        Self {
            payer: Keypair::new(),
            last_blockhash: solana_program::hash::Hash::default(),
        }
    }

    pub fn create_account(&self, lamports: u64, space: usize) -> Result<(Keypair, Transaction), String> {
        let account = Keypair::new();
        let transaction = Transaction::new_signed_with_payer(
            &[solana_program::system_instruction::create_account(
                &self.payer.pubkey(),
                &account.pubkey(),
                lamports,
                space as u64,
                &Pubkey::from_str("11111111111111111111111111111111").unwrap(),
            )],
            Some(&self.payer.pubkey()),
            &[&self.payer, &account],
            self.last_blockhash,
        );
        Ok((account, transaction))
    }

    pub fn get_clock(&self) -> Result<Clock, ProgramError> {
        Clock::get()
    }
}

pub async fn program_test() -> (BanksClient, Keypair, Hash) {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "glitch_gremlin",
        program_id,
        processor!(process_instruction),
    );

    // Configure the test environment
    program_test.set_compute_max_units(200_000);
    program_test.set_bpf_compute_max_units(100_000);
    
    program_test.start().await
}

pub async fn create_test_account(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    recent_blockhash: &Hash,
    program_id: &Pubkey,
    space: usize,
) -> Result<Keypair, BanksClientError> {
    let account = Keypair::new();
    let rent = banks_client.get_rent().await?.minimum_balance(space);

    let transaction = Transaction::new_signed_with_payer(
        &[system_instruction::create_account(
            &payer.pubkey(),
            &account.pubkey(),
            rent,
            space as u64,
            program_id,
        )],
        Some(&payer.pubkey()),
        &[payer, &account],
        *recent_blockhash,
    );

    banks_client.process_transaction(transaction).await?;
    Ok(account)
}

pub fn generate_test_chaos_params() -> ChaosParams {
    ChaosParams {
        duration: 60, // Short duration for tests
        concurrency: 2,
        security_level: SecurityLevel::Low,
        target_program: Pubkey::new_unique(),
        max_memory_mb: 512,
        max_compute_units: 100_000,
    }
}

pub fn generate_test_results() -> TestResults {
    TestResults {
        status: 1,
        compute_units: 50_000,
        memory_usage: 256 * 1024 * 1024,
        performance_metrics: Some(vec![1, 2, 3, 4]),
        error_logs: None,
        coverage_data: Some(vec![5, 6, 7, 8]),
        validator_signature: vec![0; 64],
        geographic_proofs: vec![vec![9, 10, 11, 12]],
        sgx_quote: None,
        test_duration: 30,
        peak_memory_usage: 512 * 1024 * 1024,
        total_instructions: 75_000,
        validation_score: 0.95,
        security_level: SecurityLevel::Medium,
        latency_ms: 100,
        security_score: 0.85,
        throughput: 2500,
    }
}

/// Test helper to create a ChaosRequest with default values
pub fn create_test_chaos_request(
    owner: Pubkey,
    security_level: SecurityLevel,
    params: Vec<u8>,
) -> ChaosRequest {
    ChaosRequest {
        owner,
        security_level,
        params,
        status: 0,
    }
}

/// Test helper to validate security requirements
pub fn validate_test_security(request: &ChaosRequest) -> ProgramResult {
    match request.security_level {
        SecurityLevel::Critical => {
            if request.params.len() < 32 {
                return Err(SecurityError::InvalidSecurityParameters.into());
            }
        }
        SecurityLevel::High => {
            if request.params.len() < 16 {
                return Err(SecurityError::InvalidSecurityParameters.into());
            }
        }
        _ => {}
    }
    Ok(())
}

pub struct TestAccountInfo {
    pub lamports: u64,
    pub data: Vec<u8>,
    pub owner: Pubkey,
}

impl Default for TestAccountInfo {
    fn default() -> Self {
        Self {
            lamports: 100_000,
            data: vec![0; 1024],
            owner: system_program::id(),
        }
    }
}

pub struct TestAccounts {
    pub program_id: Pubkey,
    pub admin: Pubkey,
    pub worker: Pubkey,
    pub program_account: TestAccountInfo,
    pub admin_account: TestAccountInfo,
    pub worker_account: TestAccountInfo,
}

impl TestAccounts {
    pub fn new(
        program_id: Pubkey,
        admin: Pubkey,
        worker: Pubkey,
    ) -> Self {
        Self {
            program_id,
            admin,
            worker,
            program_account: TestAccountInfo::default(),
            admin_account: TestAccountInfo::default(),
            worker_account: TestAccountInfo::default(),
        }
    }

    pub fn create_account_infos<'a>(
        &'a mut self,
        program_lamports: &'a mut u64,
        program_data: &'a mut [u8],
        admin_lamports: &'a mut u64,
        admin_data: &'a mut [u8],
        worker_lamports: &'a mut u64,
        worker_data: &'a mut [u8],
    ) -> Vec<AccountInfo<'a>> {
        vec![
            AccountInfo::new(
                &self.program_id,
                false,
                true,
                program_lamports,
                program_data,
                &self.program_account.owner,
                false,
                Rent::default().minimum_balance(program_data.len()),
            ),
            AccountInfo::new(
                &self.admin,
                true,
                false,
                admin_lamports,
                admin_data,
                &self.admin_account.owner,
                false,
                Rent::default().minimum_balance(admin_data.len()),
            ),
            AccountInfo::new(
                &self.worker,
                true,
                false,
                worker_lamports,
                worker_data,
                &self.worker_account.owner,
                false,
                Rent::default().minimum_balance(worker_data.len()),
            ),
        ]
    }
}

pub fn validate_security_level(level: SecurityLevel, entropy: u8) -> Result<(), SecurityError> {
    match level {
        SecurityLevel::Critical => {
            if entropy < 255 {
                return Err(SecurityError::InvalidSecurityParameters);
            }
        }
        SecurityLevel::High => {
            if entropy < 192 {
                return Err(SecurityError::InvalidSecurityParameters);
            }
        }
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chaos_request_creation() {
        let owner = Pubkey::new_unique();
        let params = vec![1, 2, 3, 4];
        let request = create_test_chaos_request(
            owner,
            SecurityLevel::High,
            params.clone(),
        );

        assert_eq!(request.owner, owner);
        assert_eq!(request.security_level, SecurityLevel::High);
        assert_eq!(request.params, params);
        assert_eq!(request.status, 0);
    }

    #[test]
    fn test_security_validation() {
        let owner = Pubkey::new_unique();
        
        // Test critical security level with invalid params
        let request = create_test_chaos_request(
            owner,
            SecurityLevel::Critical,
            vec![1, 2, 3], // Too short for Critical
        );
        assert!(validate_test_security(&request).is_err());

        // Test critical security level with valid params
        let request = create_test_chaos_request(
            owner,
            SecurityLevel::Critical,
            vec![1; 32], // Valid length for Critical
        );
        assert!(validate_test_security(&request).is_ok());
    }

    #[test]
    fn test_validate_security_level() {
        assert!(validate_security_level(SecurityLevel::Critical, 255).is_ok());
        assert!(validate_security_level(SecurityLevel::Critical, 254).is_err());
        assert!(validate_security_level(SecurityLevel::High, 192).is_ok());
        assert!(validate_security_level(SecurityLevel::High, 191).is_err());
        assert!(validate_security_level(SecurityLevel::Medium, 100).is_ok());
        assert!(validate_security_level(SecurityLevel::Low, 50).is_ok());
    }

    #[test]
    fn test_create_test_accounts() {
        let program_id = Pubkey::new_unique();
        let admin = Pubkey::new_unique();
        let worker = Pubkey::new_unique();

        let mut test_accounts = TestAccounts::new(program_id, admin, worker);
        
        let mut program_lamports = test_accounts.program_account.lamports;
        let mut program_data = vec![0; 1024];
        let mut admin_lamports = test_accounts.admin_account.lamports;
        let mut admin_data = vec![0; 1024];
        let mut worker_lamports = test_accounts.worker_account.lamports;
        let mut worker_data = vec![0; 1024];

        let account_infos = test_accounts.create_account_infos(
            &mut program_lamports,
            &mut program_data,
            &mut admin_lamports,
            &mut admin_data,
            &mut worker_lamports,
            &mut worker_data,
        );

        assert_eq!(account_infos.len(), 3);
        assert_eq!(account_infos[0].key, &program_id);
        assert_eq!(account_infos[1].key, &admin);
        assert_eq!(account_infos[2].key, &worker);
    }
}
