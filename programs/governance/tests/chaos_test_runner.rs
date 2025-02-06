use {
    anchor_lang::prelude::*,
    glitch_gremlin_governance::{
        state::*,
        error::GovernanceError,
        monitoring::{SecurityMonitor, Alert, AlertSeverity},
    },
    solana_program_test::*,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
        transport::TransportError,
    },
    std::{sync::Arc, time::Duration},
};

pub struct ChaosTestRunner {
    pub program_test: ProgramTest,
    pub config: TestConfig,
    pub security_monitor: Arc<SecurityMonitor>,
    pub active_tests: Vec<ChaosTest>,
}

#[derive(Debug)]
pub struct ChaosTest {
    pub id: Pubkey,
    pub params: ChaosParams,
    pub start_time: i64,
    pub findings: Vec<Finding>,
}

#[derive(Debug)]
pub struct Finding {
    pub severity: FindingSeverity,
    pub description: String,
    pub evidence: Option<String>,
    pub recommendation: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum FindingSeverity {
    Critical,
    High,
    Medium,
    Low,
}

impl ChaosTestRunner {
    pub fn new() -> Self {
        let mut program_test = ProgramTest::new(
            "glitch_gremlin_governance",
            glitch_gremlin_governance::id(),
            processor!(glitch_gremlin_governance::entry),
        );

        let config = TestConfig::new_secure();
        config.configure_program_test(&mut program_test);

        let security_monitor = Arc::new(
            SecurityMonitor::new(
                glitch_gremlin_governance::id(),
                "http://localhost:8899".to_string(),
            ).unwrap()
        );

        Self {
            program_test,
            config,
            security_monitor,
            active_tests: Vec::new(),
        }
    }

    pub async fn run_chaos_suite(&mut self) -> Result<Vec<Finding>, TransportError> {
        let mut findings = Vec::new();
        
        // 1. Governance Attack Vectors
        findings.extend(self.test_governance_attacks().await?);
        
        // 2. Resource Exhaustion Tests
        findings.extend(self.test_resource_exhaustion().await?);
        
        // 3. State Manipulation Tests
        findings.extend(self.test_state_manipulation().await?);
        
        // 4. Treasury Attack Tests
        findings.extend(self.test_treasury_attacks().await?);
        
        // 5. Concurrent Operation Tests
        findings.extend(self.test_concurrent_operations().await?);

        Ok(findings)
    }

    async fn test_governance_attacks(&self) -> Result<Vec<Finding>, TransportError> {
        let mut findings = Vec::new();
        let mut context = self.program_test.start_with_context().await;
        
        // Test 1: Proposal Spam Attack
        let spam_test = ChaosTest {
            id: Pubkey::new_unique(),
            params: ChaosParams {
                operation: ChaosOperation::ProposalSpam,
                duration: 60,
                intensity: 0.8,
                target_program: glitch_gremlin_governance::id(),
            },
            start_time: context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp,
            findings: Vec::new(),
        };
        
        if let Err(e) = self.execute_chaos_test(&mut context, &spam_test).await {
            findings.push(Finding {
                severity: FindingSeverity::High,
                description: format!("Proposal spam vulnerability found: {}", e),
                evidence: Some("Multiple proposals created in short timeframe".to_string()),
                recommendation: Some("Implement stricter rate limiting".to_string()),
            });
        }

        // Test 2: Vote Manipulation Attack
        let vote_test = ChaosTest {
            id: Pubkey::new_unique(),
            params: ChaosParams {
                operation: ChaosOperation::VoteManipulation,
                duration: 60,
                intensity: 0.9,
                target_program: glitch_gremlin_governance::id(),
            },
            start_time: context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp,
            findings: Vec::new(),
        };
        
        if let Err(e) = self.execute_chaos_test(&mut context, &vote_test).await {
            findings.push(Finding {
                severity: FindingSeverity::Critical,
                description: format!("Vote manipulation vulnerability found: {}", e),
                evidence: Some("Inconsistent vote counting detected".to_string()),
                recommendation: Some("Implement vote verification checks".to_string()),
            });
        }

        Ok(findings)
    }

    async fn test_resource_exhaustion(&self) -> Result<Vec<Finding>, TransportError> {
        let mut findings = Vec::new();
        let mut context = self.program_test.start_with_context().await;
        
        // Test 1: Memory Exhaustion
        let memory_test = ChaosTest {
            id: Pubkey::new_unique(),
            params: ChaosParams {
                operation: ChaosOperation::MemoryExhaustion,
                duration: 30,
                intensity: 0.7,
                target_program: glitch_gremlin_governance::id(),
            },
            start_time: context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp,
            findings: Vec::new(),
        };
        
        if let Err(e) = self.execute_chaos_test(&mut context, &memory_test).await {
            findings.push(Finding {
                severity: FindingSeverity::High,
                description: format!("Memory exhaustion vulnerability found: {}", e),
                evidence: Some("Program exceeded memory limits".to_string()),
                recommendation: Some("Implement stricter memory bounds checking".to_string()),
            });
        }

        Ok(findings)
    }

    async fn test_state_manipulation(&self) -> Result<Vec<Finding>, TransportError> {
        let mut findings = Vec::new();
        let mut context = self.program_test.start_with_context().await;
        
        // Test 1: Account State Manipulation
        let state_test = ChaosTest {
            id: Pubkey::new_unique(),
            params: ChaosParams {
                operation: ChaosOperation::StateManipulation,
                duration: 45,
                intensity: 0.9,
                target_program: glitch_gremlin_governance::id(),
            },
            start_time: context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp,
            findings: Vec::new(),
        };
        
        if let Err(e) = self.execute_chaos_test(&mut context, &state_test).await {
            findings.push(Finding {
                severity: FindingSeverity::Critical,
                description: format!("State manipulation vulnerability found: {}", e),
                evidence: Some("Inconsistent state transitions detected".to_string()),
                recommendation: Some("Implement state transition guards".to_string()),
            });
        }

        Ok(findings)
    }

    async fn test_treasury_attacks(&self) -> Result<Vec<Finding>, TransportError> {
        let mut findings = Vec::new();
        let mut context = self.program_test.start_with_context().await;
        
        // Test 1: Treasury Drain Attack
        let treasury_test = ChaosTest {
            id: Pubkey::new_unique(),
            params: ChaosParams {
                operation: ChaosOperation::TreasuryDrain,
                duration: 30,
                intensity: 0.95,
                target_program: glitch_gremlin_governance::id(),
            },
            start_time: context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp,
            findings: Vec::new(),
        };
        
        if let Err(e) = self.execute_chaos_test(&mut context, &treasury_test).await {
            findings.push(Finding {
                severity: FindingSeverity::Critical,
                description: format!("Treasury vulnerability found: {}", e),
                evidence: Some("Unauthorized treasury access detected".to_string()),
                recommendation: Some("Implement treasury access controls".to_string()),
            });
        }

        Ok(findings)
    }

    async fn test_concurrent_operations(&self) -> Result<Vec<Finding>, TransportError> {
        let mut findings = Vec::new();
        let mut context = self.program_test.start_with_context().await;
        
        // Test 1: Concurrent Proposal Creation
        let concurrent_test = ChaosTest {
            id: Pubkey::new_unique(),
            params: ChaosParams {
                operation: ChaosOperation::ConcurrentOperations,
                duration: 60,
                intensity: 0.8,
                target_program: glitch_gremlin_governance::id(),
            },
            start_time: context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp,
            findings: Vec::new(),
        };
        
        if let Err(e) = self.execute_chaos_test(&mut context, &concurrent_test).await {
            findings.push(Finding {
                severity: FindingSeverity::High,
                description: format!("Concurrency vulnerability found: {}", e),
                evidence: Some("Race condition in proposal creation".to_string()),
                recommendation: Some("Implement proper synchronization".to_string()),
            });
        }

        Ok(findings)
    }

    async fn execute_chaos_test(
        &self,
        context: &mut ProgramTestContext,
        test: &ChaosTest,
    ) -> Result<(), TransportError> {
        let payer = Keypair::new();
        context.banks_client.airdrop(&payer.pubkey(), 1000000000).await?;
        
        match test.params.operation {
            ChaosOperation::ProposalSpam => {
                self.execute_proposal_spam(context, &payer, test).await?;
            }
            ChaosOperation::VoteManipulation => {
                self.execute_vote_manipulation(context, &payer, test).await?;
            }
            ChaosOperation::StateManipulation => {
                self.execute_state_manipulation(context, &payer, test).await?;
            }
            ChaosOperation::TreasuryDrain => {
                self.execute_treasury_drain(context, &payer, test).await?;
            }
            ChaosOperation::ConcurrentOperations => {
                self.execute_concurrent_ops(context, &payer, test).await?;
            }
            ChaosOperation::MemoryExhaustion => {
                self.execute_memory_exhaustion(context, &payer, test).await?;
            }
        }

        Ok(())
    }

    async fn execute_proposal_spam(
        &self,
        context: &mut ProgramTestContext,
        payer: &Keypair,
        test: &ChaosTest,
    ) -> Result<(), TransportError> {
        let start_time = context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp;
        let mut proposals = Vec::new();

        while context.banks_client.get_sysvar::<Clock>().await?.unix_timestamp - start_time < test.params.duration {
            let proposal = Keypair::new();
            proposals.push(proposal);
            
            // Attempt to create proposals rapidly
            let ix = glitch_gremlin_governance::instruction::create_proposal(
                &payer.pubkey(),
                &proposal.pubkey(),
                "Spam Proposal".to_string(),
                "Description".to_string(),
                1000000,
            );

            let recent_blockhash = context.banks_client.get_latest_blockhash().await?;
            let transaction = Transaction::new_signed_with_payer(
                &[ix],
                Some(&payer.pubkey()),
                &[payer],
                recent_blockhash,
            );

            if let Err(e) = context.banks_client.process_transaction(transaction).await {
                // If we hit rate limiting, that's good
                if e.to_string().contains("rate limit") {
                    return Ok(());
                }
            }
        }

        // If we got here without hitting rate limiting, that's a potential issue
        Err(TransportError::Custom("No rate limiting detected".to_string()))
    }

    // Implement other test execution methods similarly...
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_chaos_suite() {
        let mut runner = ChaosTestRunner::new();
        let findings = runner.run_chaos_suite().await.unwrap();
        
        // Log findings
        for finding in findings {
            println!(
                "Found {:?} severity issue: {}\nEvidence: {:?}\nRecommendation: {:?}",
                finding.severity,
                finding.description,
                finding.evidence,
                finding.recommendation
            );
        }
    }
} 