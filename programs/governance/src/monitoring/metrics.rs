#[derive(Debug, Clone, Default)]
pub struct SecurityMetrics {
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub execution_success_rate: f64,
    pub failed_transactions: u64,
    pub unique_voters: Vec<Pubkey>,
    pub vote_manipulations: u64,
    pub execution_manipulations: u64,
    pub state_manipulations: u64,
    pub proposal_execution_times: ProposalExecutionStats,
    pub treasury_operations: TreasuryStats,
}

#[derive(Debug, Clone, Default)]
pub struct ProposalExecutionStats {
    pub total_executed: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub average_execution_time: f64,
}

#[derive(Debug, Clone, Default)]
pub struct TreasuryStats {
    pub total_operations: u64,
    pub successful_operations: u64,
    pub failed_operations: u64,
    pub total_volume: u64,
}

impl SecurityMetrics {
    pub fn update(&mut self, new_metrics: &SecurityMetrics) {
        self.total_proposals = new_metrics.total_proposals;
        self.active_proposals = new_metrics.active_proposals;
        self.execution_success_rate = new_metrics.execution_success_rate;
        self.failed_transactions = new_metrics.failed_transactions;
        self.unique_voters = new_metrics.unique_voters.clone();
        self.vote_manipulations = new_metrics.vote_manipulations;
        self.execution_manipulations = new_metrics.execution_manipulations;
        self.state_manipulations = new_metrics.state_manipulations;
        self.proposal_execution_times = new_metrics.proposal_execution_times.clone();
        self.treasury_operations = new_metrics.treasury_operations.clone();
    }
} 