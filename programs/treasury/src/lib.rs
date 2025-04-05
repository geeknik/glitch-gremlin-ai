use solana_program::{
    account_info::AccountInfo, 
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    program_error::ProgramError,
    sysvar::clock::Clock,
    msg,
};
use borsh::{BorshSerialize, BorshDeserialize};
use std::collections::HashMap;

const CREATOR_SHARE: u64 = 20; // 20% of incoming funds
const INSURANCE_SHARE: u64 = 15; // 15% 
const OPERATIONAL_SHARE: u64 = 10; // 10%
const YIELD_STRATEGIES_SHARE: u64 = 55; // 55%

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum FundType {
    Insurance,
    Creator,
    Operational,
    Strategy(Pubkey),
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct PaymentSchedule {
    pub recipient: Pubkey,
    pub amount: u64,
    pub frequency: u64,
    pub next_payment: i64,
    pub fund_type: FundType,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct WithdrawalRequest {
    pub amount: u64,
    pub destination: Pubkey,
    pub fund_type: FundType,
    pub approvals: Vec<Pubkey>,
    pub created_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TreasurySecurity {
    pub circuit_breaker: bool,
    pub last_ai_audit: i64,
    pub ai_model_hash: [u8; 32],
    pub required_approvals: u8,
    pub anomaly_score: f32,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TreasuryFunds {
    pub insurance_pool: u64,
    pub creator_fund: u64,
    pub operational_reserves: u64,
    pub yield_strategies: HashMap<Pubkey, u64>, // Strategy account -> amount
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TreasuryVault {
    pub funds: TreasuryFunds,
    pub security: TreasurySecurity,
    pub withdrawal_queue: Vec<WithdrawalRequest>,
    pub payment_schedules: Vec<PaymentSchedule>,
}

impl TreasuryVault {
    pub fn new() -> Self {
        Self {
            funds: TreasuryFunds {
                insurance_pool: 0,
                creator_fund: 0,
                operational_reserves: 0,
                yield_strategies: HashMap::new(),
            },
            security: TreasurySecurity {
                circuit_breaker: false,
                last_ai_audit: 0,
                ai_model_hash: [0; 32],
                required_approvals: 2,
                anomaly_score: 0.0,
            },
            withdrawal_queue: Vec::new(),
            payment_schedules: Vec::new(),
        }
    }

    /// Distribute incoming funds according to allocation ratios
    pub fn process_deposit(&mut self, amount: u64) -> ProgramResult {
        if self.security.circuit_breaker {
            msg!("Circuit breaker engaged - deposits suspended");
            return Err(ProgramError::Custom(1));
        }

        let allocations = calculate_allocations(amount);
        
        self.funds.insurance_pool += allocations.insurance;
        self.funds.creator_fund += allocations.creator;
        self.funds.operational_reserves += allocations.operational;
        self.invest_in_strategies(allocations.yield_strategies)?;

        Ok(())
    }

    /// AI-driven strategy allocation
    fn invest_in_strategies(&mut self, amount: u64) -> ProgramResult {
        let strategy = self.select_optimal_strategy()?;
        *self.funds.yield_strategies.entry(strategy).or_insert(0) += amount;
        Ok(())
    }

    fn select_optimal_strategy(&self) -> Result<Pubkey, ProgramError> {
        // Simplified selection - would integrate with AI model
        Ok(Pubkey::new_from_array([0; 32])) // Placeholder
    }

    /// Updated withdrawal request with fund source specification
    pub fn request_withdrawal(
        &mut self, 
        amount: u64, 
        destination: Pubkey,
        fund_type: FundType
    ) -> ProgramResult {
        if self.security.circuit_breaker {
            return Err(ProgramError::Custom(1));
        }

        validate_withdrawal_source(fund_type, amount, &self.funds)?;
        
        self.withdrawal_queue.push(WithdrawalRequest {
            amount,
            destination,
            fund_type,
            approvals: Vec::new(),
            created_at: Clock::get()?.unix_timestamp,
        });

        update_security_parameters(&mut self.security);
        Ok(())
    }

    fn is_authorized_signer(&self, signer: &Pubkey) -> bool {
        // TODO: Implement actual signer verification
        true
    }

    pub fn approve_withdrawal(&mut self, request_index: usize, signer: Pubkey) -> ProgramResult {
        if request_index >= self.withdrawal_queue.len() {
            return Err(ProgramError::InvalidArgument);
        }

        let request = &mut self.withdrawal_queue[request_index];
        
        if !self.is_authorized_signer(&signer) {
            return Err(ProgramError::InvalidArgument);
        }

        if !request.approvals.contains(&signer) {
            request.approvals.push(signer);
        }

        if request.approvals.len() >= self.security_state.required_approvals as usize {
            self.execute_withdrawal(request_index)?;
        }

        Ok(())
    }

    fn calculate_cooldown(amount: u64) -> i64 {
        // 1 hour base + 1 hour per 10 SOL
        (3600 + (amount / 10_000_000) * 3600) as i64
    }

    fn execute_withdrawal(&mut self, index: usize) -> ProgramResult {
        let request = &self.withdrawal_queue[index];
        let current_time = Clock::get()?.unix_timestamp;
        let cooldown = Self::calculate_cooldown(request.amount);
        
        if current_time < request.created_at + cooldown {
            return Err(ProgramError::Custom(2)); // WithdrawalTooSoon
        }

        // TODO: Implement actual fund transfer
        self.balance = self.balance.saturating_sub(request.amount);
        self.withdrawal_queue.remove(index);
        
        Ok(())
    }
}

// Helper functions
fn calculate_allocations(amount: u64) -> FundAllocation {
    FundAllocation {
        insurance: amount * INSURANCE_SHARE / 100,
        creator: amount * CREATOR_SHARE / 100,
        operational: amount * OPERATIONAL_SHARE / 100,
        yield_strategies: amount * YIELD_STRATEGIES_SHARE / 100,
    }
}

fn validate_withdrawal_source(
    fund_type: FundType,
    amount: u64,
    funds: &TreasuryFunds
) -> ProgramResult {
    match fund_type {
        FundType::Insurance => {
            if funds.insurance_pool < amount {
                return Err(ProgramError::Custom(3));
            }
        }
        FundType::Creator => {
            if funds.creator_fund < amount {
                return Err(ProgramError::Custom(4));
            }
        }
        FundType::Operational => {
            if funds.operational_reserves < amount {
                return Err(ProgramError::Custom(5));
            }
        }
        FundType::Strategy(strategy) => {
            if funds.yield_strategies.get(&strategy).unwrap_or(&0) < &amount {
                return Err(ProgramError::Custom(6));
            }
        }
    }
    Ok(())
}

struct FundAllocation {
    insurance: u64,
    creator: u64,
    operational: u64,
    yield_strategies: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Epoch;

    #[test]
    fn test_withdrawal_flow() {
        let mut vault = TreasuryVault::new();
        vault.balance = 100_000_000; // 100 SOL
        let destination = Pubkey::new_unique();
        
        // Test basic withdrawal request
        vault.request_withdrawal(10_000_000, destination).unwrap();
        assert_eq!(vault.withdrawal_queue.len(), 1);
        
        // Test approval
        let signer = Pubkey::new_unique();
        vault.approve_withdrawal(0, signer).unwrap();
        assert_eq!(vault.withdrawal_queue[0].approvals.len(), 1);
    }
}
