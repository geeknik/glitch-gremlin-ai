use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    instruction::{AccountMeta, Instruction},
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use std::error::Error;
use crate::chaos_engine::{run_chaos_test, ChaosTestResult};
use crate::instruction::GlitchInstruction;

pub async fn process_chaos_job(
    rpc_client: &RpcClient,
    program_id: &Pubkey,
    job_data: &str,
) -> Result<(), Box<dyn Error>> {
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

async fn setup_test_environment(target_program: &Pubkey) -> Result<TestEnvironment, Box<dyn Error>> {
    // TODO: Implement actual test environment setup
    // This would include:
    // - Forking the target program's state
    // - Setting up accounts
    // - Initializing test parameters
    Ok(TestEnvironment {
        target_program: *target_program,
        // Other test environment fields
    })
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
    let blockhash = rpc_client.get_latest_blockhash()?;
    
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

    rpc_client.send_and_confirm_transaction(&transaction)?;

    Ok(())
}

pub struct TestEnvironment {
    pub target_program: Pubkey,
    // Other test environment fields
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_client::rpc_client::RpcClient;
    use solana_sdk::signature::Keypair;
    use std::str::FromStr;

    const TEST_PROGRAM_ID: &str = "GremLin1111111111111111111111111111111111111";

    #[tokio::test]
    async fn test_process_chaos_job() {
        let rpc_client = RpcClient::new("https://api.testnet.solana.com");
        let program_id = Pubkey::from_str(TEST_PROGRAM_ID).unwrap();
        
        // Test job data format: request_id|params|target_program
        let job_data = format!(
            "{}|test_params|{}",
            Keypair::new().pubkey(),
            Keypair::new().pubkey()
        );

        let result = process_chaos_job(&rpc_client, &program_id, &job_data).await;
        assert!(result.is_ok(), "Job processing failed: {:?}", result);
    }

    #[tokio::test]
    async fn test_invalid_job_format() {
        let rpc_client = RpcClient::new("https://api.testnet.solana.com");
        let program_id = Pubkey::from_str(TEST_PROGRAM_ID).unwrap();
        
        // Invalid job data - missing parts
        let job_data = "invalid|format";

        let result = process_chaos_job(&rpc_client, &program_id, job_data).await;
        assert!(result.is_err(), "Expected error for invalid job format");
    }
}
