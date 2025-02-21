#![cfg(test)]

use std::{env, path::PathBuf};
use solana_program_test::*;
use solana_sdk::{
    signature::Keypair,
    signer::Signer,
    commitment_config::CommitmentLevel,
};

pub struct OptimizedTestContext {
    pub platform_tools: PathBuf,
    pub sbf_sdk: PathBuf,
    pub test_config: ProgramTestConfig,
}

impl OptimizedTestContext {
    pub fn new() -> Self {
        let platform_tools = PathBuf::from("/root/agave/platform-tools-sdk");
        let sbf_sdk = platform_tools.join("sbf");
        
        let mut test_config = ProgramTestConfig::default();
        test_config.prefer_bpf = true;
        test_config.verify_transaction_signatures = true;
        test_config.transaction_enforcement_enabled = true;
        
        Self {
            platform_tools,
            sbf_sdk,
            test_config,
        }
    }
    
    pub fn configure_program_test(&self, program_test: &mut ProgramTest) {
        // Configure SBF environment
        program_test.set_compute_max_units(1_400_000);
        program_test.add_program_arg("--sbf-sdk-path");
        program_test.add_program_arg(self.sbf_sdk.to_str().unwrap());
        
        // Enable security features
        program_test.add_program_arg("--secure-memory=true");
        program_test.add_program_arg("--memory-monitoring=true");
        
        // Configure chaos testing if enabled
        if cfg!(feature = "gremlin-secure-mode") {
            program_test.add_program_arg("--chaos-mode=true");
            program_test.add_program_arg("--chaos-probability=0.1");
        }
        
        // Set commitment level
        program_test.set_commitment_level(CommitmentLevel::Processed);
    }
    
    pub async fn start(&self) -> (BanksClient, Keypair, Hash) {
        let mut program_test = ProgramTest::default();
        self.configure_program_test(&mut program_test);
        
        program_test.start_with_context().await
    }
    
    pub fn get_platform_tool(&self, tool_name: &str) -> PathBuf {
        self.platform_tools.join(tool_name)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    
    #[tokio::test]
    async fn test_optimized_context() {
        let context = OptimizedTestContext::new();
        let (client, payer, recent_blockhash) = context.start().await;
        
        // Verify environment
        assert!(context.sbf_sdk.exists());
        assert!(context.platform_tools.exists());
        
        // Test basic transaction
        let instruction = solana_sdk::system_instruction::transfer(
            &payer.pubkey(),
            &Keypair::new().pubkey(),
            1_000_000
        );
        
        let mut transaction = Transaction::new_with_payer(
            &[instruction],
            Some(&payer.pubkey()),
        );
        transaction.sign(&[&payer], recent_blockhash);
        
        client.process_transaction(transaction).await.unwrap();
    }
} 