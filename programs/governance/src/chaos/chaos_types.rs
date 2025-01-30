use anchor_lang::prelude::*;
use crate::error::GovernanceError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ChaosType {
    ConcurrencyTest {
        num_concurrent_txns: u32,
        interval_ms: u64,
    },
    FlashLoanProbe {
        token_mint: Pubkey,
        amount: u64,
    },
    StateConsistency {
        target_accounts: Vec<Pubkey>,
        check_interval: u64,
    },
    TimelockBypass {
        target_timelock: i64,
        attempts: u32,
    },
    QuorumManipulation {
        target_percentage: u8,
        stake_simulation: u64,
    },
    InstructionInjection {
        target_ix: Vec<u8>,
        injection_point: u64,
    },
}

impl ChaosType {
    pub fn validate(&self) -> Result<()> {
        match self {
            Self::ConcurrencyTest { num_concurrent_txns, interval_ms } => {
                require!(*num_concurrent_txns > 0, GovernanceError::InvalidChaosParameters);
                require!(*interval_ms > 0, GovernanceError::InvalidChaosParameters);
            },
            Self::FlashLoanProbe { amount, .. } => {
                require!(*amount > 0, GovernanceError::InvalidChaosParameters);
            },
            Self::StateConsistency { target_accounts, check_interval } => {
                require!(!target_accounts.is_empty(), GovernanceError::InvalidChaosParameters);
                require!(*check_interval > 0, GovernanceError::InvalidChaosParameters);
            },
            Self::TimelockBypass { target_timelock, attempts } => {
                require!(*target_timelock > 0, GovernanceError::InvalidChaosParameters);
                require!(*attempts > 0, GovernanceError::InvalidChaosParameters);
            },
            Self::QuorumManipulation { target_percentage, stake_simulation } => {
                require!(*target_percentage > 0 && *target_percentage <= 100, 
                    GovernanceError::InvalidChaosParameters);
                require!(*stake_simulation > 0, GovernanceError::InvalidChaosParameters);
            },
            Self::InstructionInjection { target_ix, injection_point } => {
                require!(!target_ix.is_empty(), GovernanceError::InvalidChaosParameters);
                require!(*injection_point > 0, GovernanceError::InvalidChaosParameters);
            },
        }
        Ok(())
    }

    pub fn estimate_resource_usage(&self) -> ResourceUsage {
        ResourceUsage {
            compute_units: self.compute_units_estimate(),
            memory_bytes: self.memory_usage_estimate(),
            transaction_count: self.required_transaction_count(),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ResourceUsage {
    pub compute_units: u32,
    pub memory_bytes: u64,
    pub transaction_count: u32,
} 