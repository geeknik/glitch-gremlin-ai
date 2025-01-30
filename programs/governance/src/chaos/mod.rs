use anchor_lang::prelude::*;
use solana_program::{
    program::invoke_signed,
    system_instruction,
};
use crate::{
    state::{Proposal, ProposalState},
    GovernanceError,
};

pub mod test_runner;
pub mod monitoring;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ChaosTestResult {
    pub success: bool,
    pub findings: Vec<Finding>,
    pub errors: Vec<String>,
    pub transactions_processed: u64,
    pub lamports_spent: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum FindingSeverity {
    Critical,
    High,
    Medium,
    Low,
    Informational,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct Finding {
    pub category: FindingCategory,
    pub severity: FindingSeverity,
    pub program_id: String,
    pub details: String,
    pub transaction_signature: Option<String>,
    pub timestamp: i64,
}

impl Finding {
    pub fn new(
        category: FindingCategory,
        severity: FindingSeverity,
        program_id: &Pubkey,
        details: String,
        transaction_signature: Option<String>,
    ) -> Self {
        Self {
            category,
            severity,
            program_id: program_id.to_string(),
            details,
            transaction_signature,
            timestamp: Clock::get().unwrap().unix_timestamp,
        }
    }
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
    let seeds = b"treasury";
    Pubkey::find_program_address(&[seeds], program_id)
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
        let treasury_seeds = &[b"treasury", &[treasury_bump]];
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