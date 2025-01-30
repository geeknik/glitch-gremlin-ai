use libafl::prelude::*;
use solana_program::{
    account_info::AccountInfo,
    instruction::Instruction,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::time::Duration;

/// Harness for testing Solana programs
pub struct ChaosHarness {
    program_id: Pubkey,
    accounts: Vec<AccountInfo>,
}

impl ChaosHarness {
    pub fn new(program_id: &str) -> Self {
        Self {
            program_id: Pubkey::try_from(program_id).unwrap(),
            accounts: Vec::new(),
        }
    }
}

/// Execution context for test cases
pub struct ExecutionContext {
    pub test_case: ChaosTestCase,
    pub compute_budget: ComputeBudget,
    pub timeout: Duration,
}

/// Compute budget for program execution
pub struct ComputeBudget {
    pub units: u32,
    pub heap_bytes: Option<u32>,
}

impl<'a> Executor<ChaosTestCase> for ChaosHarness {
    fn run_target(
        &mut self,
        ctx: &mut ExecutionContext,
    ) -> Result<ExitKind, Error> {
        // Convert test case accounts to AccountInfo
        let accounts: Vec<AccountInfo> = ctx.test_case.accounts
            .iter()
            .map(|acc| {
                // Create account data based on test case
                let mut data = vec![0u8; 1024]; // Default size
                let mut lamports = 1_000_000; // Default lamports

                AccountInfo::new(
                    &Pubkey::try_from(&acc.pubkey).unwrap(),
                    acc.is_signer,
                    acc.is_writable,
                    &mut lamports,
                    &mut data,
                    &self.program_id,
                    false,
                    0,
                )
            })
            .collect();

        // Create instruction
        let instruction = Instruction {
            program_id: self.program_id,
            accounts: ctx.test_case.accounts
                .iter()
                .map(|acc| solana_program::instruction::AccountMeta {
                    pubkey: Pubkey::try_from(&acc.pubkey).unwrap(),
                    is_signer: acc.is_signer,
                    is_writable: acc.is_writable,
                })
                .collect(),
            data: ctx.test_case.instruction_data.clone(),
        };

        // Set compute budget
        solana_program::compute_budget::ComputeBudget::set_compute_unit_limit(
            ctx.compute_budget.units
        );
        if let Some(heap_bytes) = ctx.compute_budget.heap_bytes {
            solana_program::compute_budget::ComputeBudget::request_heap_frame(heap_bytes);
        }

        // Execute program
        match solana_program::entrypoint::process_instruction(
            &self.program_id,
            &accounts,
            &instruction.data,
        ) {
            Ok(_) => {
                match ctx.test_case.expected_result {
                    ExpectedResult::Success => Ok(ExitKind::Ok),
                    _ => Ok(ExitKind::Crash),
                }
            }
            Err(err) => {
                match (err, &ctx.test_case.expected_result) {
                    (ProgramError::Custom(code), ExpectedResult::FailWith(expected_code))
                        if code.to_string() == *expected_code => Ok(ExitKind::Ok),
                    (_, ExpectedResult::Revert) => Ok(ExitKind::Ok),
                    _ => Ok(ExitKind::Crash),
                }
            }
        }
    }
}

/// Custom fuzzer for Solana programs
pub struct SolanaFuzzer<'a> {
    harness: &'a mut ChaosHarness,
    state: StdState<ChaosTestCase, (), ()>,
    scheduler: QueueScheduler<ChaosTestCase>,
}

impl<'a> SolanaFuzzer<'a> {
    pub fn new(harness: &'a mut ChaosHarness) -> Self {
        let scheduler = QueueScheduler::new();
        let monitor = SimpleMonitor::new(|s| println!("{}", s));
        let feedback = MaxMapFeedback::new(&monitor);
        
        let state = StdState::new(
            StdRand::with_seed(current_nanos()),
            (),
            tuple_list!(),
            tuple_list!(),
        );

        Self {
            harness,
            state,
            scheduler,
        }
    }

    /// Run a single test case
    pub fn run_test(
        &mut self,
        test_case: ChaosTestCase,
        compute_budget: ComputeBudget,
        timeout: Duration,
    ) -> Result<ExitKind, Error> {
        let mut ctx = ExecutionContext {
            test_case,
            compute_budget,
            timeout,
        };

        self.harness.run_target(&mut ctx)
    }
}

/// Mutation engine for test cases
pub struct ChaosMutator {
    max_size: usize,
}

impl ChaosMutator {
    pub fn new(max_size: usize) -> Self {
        Self { max_size }
    }
}

impl Mutator<ChaosTestCase> for ChaosMutator {
    fn mutate(
        &mut self,
        state: &mut StdState<ChaosTestCase, (), ()>,
        test_case: &mut ChaosTestCase,
        _stage_idx: i32,
    ) -> Result<(), Error> {
        // Mutate instruction data
        if !test_case.instruction_data.is_empty() {
            let idx = state.rand_mut().below(test_case.instruction_data.len() as u64) as usize;
            test_case.instruction_data[idx] = state.rand_mut().below(256) as u8;
        }

        // Mutate accounts
        if !test_case.accounts.is_empty() {
            let idx = state.rand_mut().below(test_case.accounts.len() as u64) as usize;
            let account = &mut test_case.accounts[idx];
            
            // Randomly toggle signer/writable flags
            if state.rand_mut().below(2) == 0 {
                account.is_signer = !account.is_signer;
            }
            if state.rand_mut().below(2) == 0 {
                account.is_writable = !account.is_writable;
            }
        }

        Ok(())
    }
} 