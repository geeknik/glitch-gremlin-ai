use solana_program::pubkey::Pubkey;
use std::str::FromStr;
use crate::chaos_analyzer::vulnerabilities::{VulnerabilityAnalyzer, Vulnerability};

/// Contract testing configuration
#[derive(Debug, Clone)]
pub struct ContractTestConfig {
    pub program_id: Pubkey,
    pub rpc_url: String,
    pub test_wallet: Option<Pubkey>,
    pub max_transactions: usize,
    pub max_accounts: usize,
}

/// Results from contract testing
#[derive(Debug, Clone)]
pub struct ContractTestResults {
    pub vulnerabilities: Vec<Vulnerability>,
    pub transaction_count: usize,
    pub unique_accounts: usize,
    pub instruction_coverage: f64,
    pub test_duration: std::time::Duration,
}

/// Contract tester for analyzing deployed Solana programs
pub struct ContractTester {
    config: ContractTestConfig,
    analyzer: VulnerabilityAnalyzer,
}

impl ContractTester {
    pub fn new(config: ContractTestConfig) -> Self {
        Self {
            config,
            analyzer: VulnerabilityAnalyzer::new(),
        }
    }

    /// Test a deployed contract by analyzing its on-chain activity
    pub async fn test_contract(&mut self) -> Result<ContractTestResults, String> {
        let start_time = std::time::Instant::now();
        let mut results = ContractTestResults {
            vulnerabilities: Vec::new(),
            transaction_count: 0,
            unique_accounts: 0,
            instruction_coverage: 0.0,
            test_duration: std::time::Duration::default(),
        };

        // Connect to RPC
        let rpc_client = solana_client::rpc_client::RpcClient::new(self.config.rpc_url.clone());

        // Get program data
        let program_data = rpc_client
            .get_account_data(&self.config.program_id)
            .map_err(|e| format!("Failed to get program data: {}", e))?;

        // Get recent transactions
        let signatures = rpc_client
            .get_signatures_for_address(&self.config.program_id)
            .map_err(|e| format!("Failed to get signatures: {}", e))?;

        let mut unique_accounts = std::collections::HashSet::new();
        let mut analyzed_instructions = std::collections::HashSet::new();

        // Analyze recent transactions
        for (i, sig_info) in signatures.iter().enumerate() {
            if i >= self.config.max_transactions {
                break;
            }

            if let Ok(tx) = rpc_client.get_transaction(&sig_info.signature, solana_client::rpc_config::RpcTransactionConfig::default()) {
                // Track accounts
                for account in tx.transaction.message.account_keys {
                    unique_accounts.insert(account);
                }

                // Analyze instructions
                for ix in tx.transaction.message.instructions {
                    if ix.program_id == self.config.program_id {
                        analyzed_instructions.insert(ix.data[0]); // Track instruction discriminator
                        
                        // Check for unsafe patterns
                        self.analyze_instruction(&ix, &tx)?;
                    }
                }

                results.transaction_count += 1;
            }
        }

        results.unique_accounts = unique_accounts.len();
        results.instruction_coverage = analyzed_instructions.len() as f64 / 256.0; // Assuming 8-bit instruction discriminator
        results.vulnerabilities = self.analyzer.vulnerabilities.clone();
        results.test_duration = start_time.elapsed();

        Ok(results)
    }

    /// Analyze a single instruction for vulnerabilities
    fn analyze_instruction(
        &mut self,
        ix: &solana_program::instruction::CompiledInstruction,
        tx: &solana_client::rpc_response::EncodedConfirmedTransaction,
    ) -> Result<(), String> {
        // Check for unsafe account validation
        self.check_account_validation(ix, tx);
        
        // Check for unsafe CPIs
        self.check_unsafe_cpi(ix, tx);
        
        // Check for unsafe token operations
        self.check_token_operations(ix, tx);
        
        // Check for unsafe PDA usage
        self.check_pda_usage(ix, tx);

        Ok(())
    }

    /// Check for unsafe account validation patterns
    fn check_account_validation(
        &mut self,
        ix: &solana_program::instruction::CompiledInstruction,
        tx: &solana_client::rpc_response::EncodedConfirmedTransaction,
    ) {
        let accounts = &tx.transaction.message.account_keys;
        
        // Check owner verification
        for (i, account) in accounts.iter().enumerate() {
            if ix.accounts.contains(&(i as u8)) {
                // Account is used in instruction - verify owner checks
                if !self.has_owner_check(ix, account) {
                    self.analyzer.vulnerabilities.push(Vulnerability {
                        vuln_type: crate::chaos_analyzer::vulnerabilities::VulnerabilityType::UnsafeAccountValidation,
                        severity: "High".to_string(),
                        description: format!("Account {} used without owner verification", account),
                        location: format!("Instruction: {}", ix.data[0]),
                        recommendation: "Add owner verification for account".to_string(),
                    });
                }
            }
        }
    }

    /// Check for unsafe CPI patterns
    fn check_unsafe_cpi(
        &mut self,
        ix: &solana_program::instruction::CompiledInstruction,
        tx: &solana_client::rpc_response::EncodedConfirmedTransaction,
    ) {
        // Track CPI calls
        for inner_ix in tx.meta.as_ref().unwrap().inner_instructions.iter().flatten() {
            if inner_ix.instruction.program_id != self.config.program_id {
                // This is a CPI - check for validation
                if !self.has_program_check(&inner_ix.instruction) {
                    self.analyzer.vulnerabilities.push(Vulnerability {
                        vuln_type: crate::chaos_analyzer::vulnerabilities::VulnerabilityType::UnsafeCpiValidation,
                        severity: "Critical".to_string(),
                        description: format!("Unsafe CPI to program {}", inner_ix.instruction.program_id),
                        location: format!("Instruction: {}", ix.data[0]),
                        recommendation: "Add program ID verification before CPI".to_string(),
                    });
                }
            }
        }
    }

    /// Check for unsafe token operations
    fn check_token_operations(
        &mut self,
        ix: &solana_program::instruction::CompiledInstruction,
        tx: &solana_client::rpc_response::EncodedConfirmedTransaction,
    ) {
        // Check if instruction interacts with SPL Token program
        let token_program_id = Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap();
        
        if tx.transaction.message.account_keys.contains(&token_program_id) {
            // This instruction involves tokens - check for validation
            if !self.has_token_validation(ix) {
                self.analyzer.vulnerabilities.push(Vulnerability {
                    vuln_type: crate::chaos_analyzer::vulnerabilities::VulnerabilityType::UnsafeTokenOperation,
                    severity: "Critical".to_string(),
                    description: "Token operation without proper validation".to_string(),
                    location: format!("Instruction: {}", ix.data[0]),
                    recommendation: "Add token account validation".to_string(),
                });
            }
        }
    }

    /// Check for unsafe PDA usage
    fn check_pda_usage(
        &mut self,
        ix: &solana_program::instruction::CompiledInstruction,
        tx: &solana_client::rpc_response::EncodedConfirmedTransaction,
    ) {
        // Check if any accounts are PDAs
        for (i, account) in tx.transaction.message.account_keys.iter().enumerate() {
            if ix.accounts.contains(&(i as u8)) {
                if self.is_pda(account) && !self.has_pda_validation(ix, account) {
                    self.analyzer.vulnerabilities.push(Vulnerability {
                        vuln_type: crate::chaos_analyzer::vulnerabilities::VulnerabilityType::UnsafePdaValidation,
                        severity: "High".to_string(),
                        description: format!("PDA {} used without validation", account),
                        location: format!("Instruction: {}", ix.data[0]),
                        recommendation: "Add PDA validation".to_string(),
                    });
                }
            }
        }
    }

    /// Helper function to check if an account has owner verification
    fn has_owner_check(&self, ix: &solana_program::instruction::CompiledInstruction, account: &Pubkey) -> bool {
        // Implementation would check instruction data for owner verification
        // This is a simplified check - would need program-specific logic
        ix.data.len() > 1 && ix.data[1..].contains(&0x1) // Assuming 0x1 is owner check discriminator
    }

    /// Helper function to check if a CPI has program verification
    fn has_program_check(&self, ix: &solana_program::instruction::CompiledInstruction) -> bool {
        // Implementation would check for program ID verification
        // This is a simplified check - would need program-specific logic
        ix.data.len() > 1 && ix.data[1..].contains(&0x2) // Assuming 0x2 is program check discriminator
    }

    /// Helper function to check if instruction has token validation
    fn has_token_validation(&self, ix: &solana_program::instruction::CompiledInstruction) -> bool {
        // Implementation would check for token account validation
        // This is a simplified check - would need program-specific logic
        ix.data.len() > 1 && ix.data[1..].contains(&0x3) // Assuming 0x3 is token validation discriminator
    }

    /// Helper function to check if an account is a PDA
    fn is_pda(&self, account: &Pubkey) -> bool {
        // Implementation would check if account is a PDA
        // This is a simplified check - would need to actually try PDA derivation
        !account.is_on_curve()
    }

    /// Helper function to check if PDA is properly validated
    fn has_pda_validation(&self, ix: &solana_program::instruction::CompiledInstruction, pda: &Pubkey) -> bool {
        // Implementation would check for PDA validation
        // This is a simplified check - would need program-specific logic
        ix.data.len() > 1 && ix.data[1..].contains(&0x4) // Assuming 0x4 is PDA validation discriminator
    }
} 