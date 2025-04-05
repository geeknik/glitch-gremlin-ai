use rayon::prelude::*;
use solana_program::borsh::BorshSerialize;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(BorshSerialize)]
pub struct ChaosEngine<C: ChaosTest + Sync> {
    test_queue: Vec<C>,
    resource_budget: ResourcePool,
    #[serde(skip)]
    concurrent_workers: AtomicU64,
}

impl<C: ChaosTest + Sync> ChaosEngine<C> {
    const MAX_CONCURRENT: u64 = 8;
    const WORKER_STACK_SIZE: usize = 2 * 1024 * 1024; // 2MB per worker

    pub fn execute_tests(&self) -> Vec<TestResult> {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(Self::MAX_CONCURRENT as usize)
            .stack_size(Self::WORKER_STACK_SIZE)
            .build()
            .expect("Failed to build thread pool");

        pool.install(|| {
            self.test_queue
                .par_chunks(Self::chunk_size())
                .flat_map(|chunk| {
                    chunk.into_par_iter()
                        .map(|test| {
                            self.resource_budget.acquire(test.resource_profile())?;
                            let result = test.execute();
                            self.resource_budget.release(test.resource_profile());
                            Ok(result)
                        })
                        .collect::<Vec<_>>()
                })
                .collect()
        })
    }

    #[inline]
    fn chunk_size() -> usize {
        (Self::MAX_CONCURRENT as usize * 4).next_power_of_two()
    }
}

pub trait ChaosTest: Send + Sync {
    fn execute(&self) -> TestResult;
    fn resource_profile(&self) -> ResourceProfile;
}
