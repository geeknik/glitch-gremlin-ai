use anchor_lang::prelude::*;
use solana_program::{
    program::invoke_signed,
    system_instruction,
};
use crate::{
    state::{Proposal, ProposalState},
    GovernanceError,
    error::{Result, WithErrorContext},
};
use std::time::Duration;

pub mod test_runner;
pub mod monitoring;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ChaosTestResult {
    pub findings: Vec<Finding>,
    pub duration: i64,
    pub timestamp: i64,
    pub success: bool,
    pub errors: Vec<String>,
    pub lamports_spent: u64,
    pub total_transactions: u64,
}

impl ChaosTestResult {
    pub fn new() -> Self {
        Self {
            findings: Vec::new(),
            duration: 0,
            timestamp: Clock::get().unwrap().unix_timestamp,
            success: true,
            errors: Vec::new(),
            lamports_spent: 0,
            total_transactions: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Finding {
    pub title: String,
    pub description: String,
    pub severity: FindingSeverity,
    pub program_id: Pubkey,
    pub timestamp: i64,
    pub duration: i64,
    pub transaction_signature: Option<String>,
}

impl Finding {
    pub fn new(
        title: String,
        description: String,
        severity: FindingSeverity,
        program_id: Pubkey,
        transaction_signature: Option<String>,
    ) -> Self {
        Self {
            title,
            description,
            severity,
            program_id,
            timestamp: Clock::get().unwrap().unix_timestamp,
            duration: 0,
            transaction_signature,
        }
    }

    pub fn with_duration(mut self, duration: i64) -> Self {
        self.duration = duration;
        self
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum FindingSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum FindingCategory {
    SecurityVulnerability,
    Security,
    DataInconsistency,
    PerformanceIssue,
    ConcurrencyIssue,
    LogicError,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone)]
pub struct TestResult {
    pub findings: Vec<Finding>,
    pub errors: Vec<String>,
    pub program_id: Pubkey,
    pub test_name: String,
    pub timestamp: i64,
}

pub fn find_treasury_address(program_id: &Pubkey) -> (Pubkey, u8) {
    let seeds = &[b"treasury".as_ref()];
    Pubkey::find_program_address(seeds, program_id)
}

pub struct ChaosTestRunner {
    pub program_id: Pubkey,
    pub findings: Vec<Finding>,
    pub max_duration: i64,
}

impl ChaosTestRunner {
    pub fn new(program_id: Pubkey, max_duration: i64) -> Self {
        Self {
            program_id,
            findings: Vec::new(),
            max_duration,
        }
    }

    pub async fn run_test(&mut self) -> Result<()> {
        let start_time = Clock::get()?.unix_timestamp;
        
        while Clock::get()?.unix_timestamp - start_time < self.max_duration {
            // Monitor execution anomalies
            monitor_execution_anomalies(&self.program_id, &mut self.findings).await?;
            
            // Monitor state consistency
            monitor_state_consistency(&self.program_id, &mut self.findings).await?;
            
            // Monitor manipulation attempts
            monitor_manipulation_attempts(&self.program_id, &mut self.findings).await?;

            // Sleep between iterations
            sleep(Duration::from_secs(1)).await;
        }

        Ok(())
    }

    pub fn get_findings(&self) -> &[Finding] {
        &self.findings
    }
}

pub fn process_treasury_operation(
    ctx: Context<TreasuryOperation>,
    amount: u64,
    operation_type: String,
) -> Result<()> {
    let treasury_bump = *ctx.bumps.get("treasury").unwrap();
    let treasury_seeds = &[b"treasury", treasury_bump.to_le_bytes().as_ref()];
    
    // Process the treasury operation
    let treasury = &mut ctx.accounts.treasury;
    treasury.total_operations = treasury.total_operations
        .checked_add(1)
        .ok_or(GovernanceError::ArithmeticOverflow)
        .with_context("Treasury Operation", "Failed to increment total operations")?;
        
    treasury.total_volume = treasury.total_volume
        .checked_add(amount)
        .ok_or(GovernanceError::ArithmeticOverflow)
        .with_context("Treasury Operation", "Failed to increment total volume")?;
        
    if amount > treasury.largest_operation {
        treasury.largest_operation = amount;
    }
    
    let count = treasury.operation_distribution
        .entry(operation_type)
        .or_insert(0);
        
    *count = count
        .checked_add(1)
        .ok_or(GovernanceError::ArithmeticOverflow)
        .with_context("Treasury Operation", "Failed to increment operation count")?;
    
    Ok(())
}

pub fn run_chaos_test(
    program_id: &Pubkey,
    max_duration: i64,
    target_program: &Pubkey,
) -> Result<ChaosTestResult> {
    let test_result = test_runner::run_chaos_test(
        target_program,
        max_duration,
        program_id,
    ).await.map_err(|e| {
        msg!("Chaos test failed: {}", e);
        GovernanceError::TestExecutionFailed
    })?;

    Ok(test_result)
}

pub fn execute_chaos_test(
    proposal: &Proposal,
    program_id: &Pubkey,
    treasury: &Pubkey,
    treasury_bump: u8,
) -> Result<ChaosTestResult> {
    require!(
        proposal.state == ProposalState::Active && 
        !proposal.executed,
        GovernanceError::InvalidProposalState
    );

    // Fund the test if required
    if proposal.requires_funding && proposal.treasury_amount > 0 {
        let treasury_seeds = &[b"treasury", &treasury_bump.to_le_bytes()];
        invoke_signed(
            &system_instruction::transfer(
                treasury,
                &proposal.target_program,
                proposal.treasury_amount,
            ),
            &[],
            &[treasury_seeds],
        )?;
    }

    // Execute the chaos test based on parameters
    let test_result = test_runner::run_chaos_test(
        &proposal.target_program,
        proposal.max_duration,
        program_id,
    )?;

    // Monitor and collect results
    let monitoring_result = monitoring::collect_test_results(
        &proposal.target_program,
        test_result,
    )?;

    Ok(monitoring_result)
}

#[error_code]
pub enum ChaosError {
    #[msg("Test execution exceeded maximum duration")]
    TestTimeout,
    #[msg("Failed to execute chaos test")]
    ExecutionError,
    #[msg("Failed to collect test results")]
    MonitoringError,
} 