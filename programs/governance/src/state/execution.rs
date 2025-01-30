use anchor_lang::prelude::*;
use crate::error::GovernanceError;
use crate::chaos::chaos_types::ChaosType;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ExecutionContext {
    pub executed_at: i64,
    pub executor: Pubkey,
    pub success: bool,
    pub results: Vec<ExecutionResult>,
    pub resources_used: ResourceUsage,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ExecutionResult {
    pub chaos_type: ChaosType,
    pub success: bool,
    pub error_message: Option<String>,
    pub affected_accounts: Vec<Pubkey>,
    pub execution_time: i64,
}

impl ExecutionContext {
    pub fn new(executor: Pubkey, clock: &Clock) -> Self {
        Self {
            executed_at: clock.unix_timestamp,
            executor,
            success: false,
            results: Vec::new(),
            resources_used: ResourceUsage {
                compute_units: 0,
                memory_bytes: 0,
                transaction_count: 0,
            },
        }
    }

    pub fn record_result(&mut self, result: ExecutionResult) {
        self.success = self.success && result.success;
        self.results.push(result);
    }
} 