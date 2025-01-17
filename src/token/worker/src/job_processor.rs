use borsh::BorshSerialize;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    instruction::{AccountMeta, Instruction},
    signature::{Keypair, Signer},
    transaction::Transaction,
    system_instruction,
    sysvar::rent::Rent,
};
use std::error::Error;
use std::fmt;
use std::error::Error;

#[derive(Debug)]
pub enum JobProcessorError {
    InvalidJobFormat,
    ProgramIdParseError,
    TestSetupError,
    TestExecutionError,
    FinalizationError,
}

impl fmt::Display for JobProcessorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            JobProcessorError::InvalidJobFormat => write!(f, "Invalid job format"),
            JobProcessorError::ProgramIdParseError => write!(f, "Failed to parse program ID"),
            JobProcessorError::TestSetupError => write!(f, "Test environment setup failed"),
            JobProcessorError::TestExecutionError => write!(f, "Chaos test execution failed"),
            JobProcessorError::FinalizationError => write!(f, "Request finalization failed"),
        }
    }
}

impl Error for JobProcessorError {}

impl From<&str> for JobProcessorError {
    fn from(err: &str) -> Self {
        JobProcessorError::InvalidJobFormat
    }
}

impl From<Box<dyn Error + Send + Sync>> for JobProcessorError {
    fn from(_err: Box<dyn Error + Send + Sync>) -> Self {
        JobProcessorError::TestExecutionError
    }
}

impl From<JobProcessorError> for Box<dyn Error + Send + Sync> {
    fn from(e: JobProcessorError) -> Self {
        Box::new(e)
    }
}
use super::chaos_engine::{run_chaos_test, ChaosTestResult};
use crate::instruction::GlitchInstruction;

pub async fn process_chaos_job(
    rpc_client: &RpcClient,
    program_id: &Pubkey,
    job_data: &str,
) -> Result<(), JobProcessorError> {
    // Parse job data
    let parts: Vec<&str> = job_data.split('|').collect();
    if parts.len() < 3 {
        return Err("Invalid job format".into());
    }

    let request_id = parts[0];
    let params = parts[1];
    let target_program = parts[2].parse::<Pubkey>()?;

    println!("Processing chaos request {} for program {}", request_id, target_program);

    // 1. Set up test environment
    let test_env = setup_test_environment(&target_program).await?;

    // 2. Run chaos scenarios
    let test_result = run_chaos_test(&test_env, params).await?;

    // 3. Finalize on-chain request
    finalize_chaos_request(rpc_client, program_id, request_id, test_result).await?;

    Ok(())
}

async fn setup_test_environment(target_program: &Pubkey) -> Result<TestEnvironment, Box<dyn Error + Send + Sync>> {
    // Initialize test environment with default values
    Ok(TestEnvironment {
        target_program: *target_program,
        test_accounts: Vec::new(),
        test_parameters: TestParameters::default(),
        start_time: std::time::Instant::now(),
    })
}

#[derive(Default)]
struct TestParameters {
    duration: u64,
    intensity: u8,
    concurrency_level: u8,
    max_latency: u64,
    error_threshold: u8,
}

async fn finalize_chaos_request(
    rpc_client: &RpcClient,
    program_id: &Pubkey,
    request_id: &str,
    result: ChaosTestResult,
) -> Result<(), Box<dyn Error>> {
    let request_pubkey = request_id.parse::<Pubkey>()?;
    
    // Create finalize instruction
    let instruction = GlitchInstruction::FinalizeChaosRequest {
        status: result.status as u8,
        result_ref: result.logs.into_bytes(),
    };

    // Create and send transaction
    let signer = Keypair::new();
    let blockhash = rpc_client.get_latest_blockhash().await?;
    
    let transaction = Transaction::new_signed_with_payer(
        &[Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new(request_pubkey, false),
                AccountMeta::new(signer.pubkey(), true),
            ],
            data: instruction.try_to_vec()?,
        }],
        Some(&signer.pubkey()),
        &[&signer],
        blockhash,
    );

    rpc_client.send_and_confirm_transaction(&transaction).await?;

    Ok(())
}

pub struct TestEnvironment {
    pub target_program: Pubkey,
    pub test_accounts: Vec<Pubkey>,
    pub test_parameters: TestParameters,
    pub start_time: std::time::Instant,
}

impl Default for TestEnvironment {
    fn default() -> Self {
        Self {
            target_program: Pubkey::default(),
            test_accounts: Vec::new(),
            test_parameters: TestParameters::default(),
            start_time: std::time::Instant::now(),
        }
    }
}

impl TestEnvironment {
    pub fn new(target_program: Pubkey) -> Self {
        Self {
            target_program,
            test_accounts: Vec::new(),
            test_parameters: TestParameters::default(),
            start_time: std::time::Instant::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_client::nonblocking::rpc_client::RpcClient;
    use solana_sdk::signature::Keypair;
    use std::str::FromStr;
    use glitch_shared::test_utils::program_test;

    const TEST_PROGRAM_ID: &str = "GremLin1111111111111111111111111111111111111";

    #[tokio::test]
    async fn test_process_chaos_job() -> Result<(), Box<dyn std::error::Error>> {
        // Use local test validator
        let (mut banks_client, payer, recent_blockhash) = program_test().await;
        let program_id = Pubkey::from_str(TEST_PROGRAM_ID).unwrap();
        
        // Create chaos request account
        let chaos_request = Keypair::new();
        let rent = Rent::default().minimum_balance(100);
        
        // Create chaos request account
        let create_account_ix = system_instruction::create_account(
            &payer.pubkey(),
            &chaos_request.pubkey(),
            rent,
            100,
            &program_id,
        );

        // Create escrow account
        let escrow_account = Keypair::new();
        let escrow_rent = Rent::default().minimum_balance(100);
        
        let create_escrow_ix = system_instruction::create_account(
            &payer.pubkey(),
            &escrow_account.pubkey(),
            escrow_rent,
            100,
            &program_id,
        );

        // Send both create account transactions
        let transaction = Transaction::new_signed_with_payer(
            &[create_account_ix, create_escrow_ix],
            Some(&payer.pubkey()),
            &[&payer, &chaos_request, &escrow_account],
            recent_blockhash,
        );
        banks_client.process_transaction(transaction).await?;

        // Test job data format: request_id|params|target_program
        let job_data = format!(
            "{}|test_params|{}",
            chaos_request.pubkey(),
            Keypair::new().pubkey()
        );

        // Create a new RpcClient for the test
        let rpc_client = RpcClient::new("http://localhost:8899".to_string());
        let result = process_chaos_job(&rpc_client, &program_id, &job_data).await;
        assert!(result.is_ok(), "Job processing failed: {:?}", result);
        Ok(())
    }

    #[tokio::test]
    async fn test_invalid_job_format() {
        let rpc_client = RpcClient::new("https://api.testnet.solana.com".to_string());
        let program_id = Pubkey::from_str(TEST_PROGRAM_ID).unwrap();
        
        // Invalid job data - missing parts
        let job_data = "invalid|format";

        let result = process_chaos_job(&rpc_client, &program_id, job_data).await;
        assert!(result.is_err(), "Expected error for invalid job format");
    }
}
