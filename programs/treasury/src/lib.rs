use solana_program::{
    account_info::AccountInfo, 
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    program_error::ProgramError,
    sysvar::clock::Clock,
};
use borsh::{BorshSerialize, BorshDeserialize};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct WithdrawalRequest {
    pub amount: u64,
    pub destination: Pubkey,
    pub approvals: Vec<Pubkey>,
    pub created_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct SecurityState {
    pub anomaly_score: f32,
    pub circuit_breaker: bool,
    pub required_approvals: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TreasuryVault {
    pub balance: u64,
    pub withdrawal_queue: Vec<WithdrawalRequest>,
    pub security_state: SecurityState,
    pub last_audit_timestamp: i64,
}

impl TreasuryVault {
    pub fn new() -> Self {
        Self {
            balance: 0,
            withdrawal_queue: Vec::new(),
            security_state: SecurityState {
                anomaly_score: 0.0,
                circuit_breaker: false,
                required_approvals: 2,
            },
            last_audit_timestamp: 0,
        }
    }

    pub fn request_withdrawal(&mut self, amount: u64, destination: Pubkey) -> ProgramResult {
        if self.security_state.circuit_breaker {
            return Err(ProgramError::Custom(1)); // CircuitBreakerEngaged
        }
        
        let required_sigs = 2 + (self.security_state.anomaly_score * 3.0).ceil() as u8;
        self.security_state.required_approvals = required_sigs.min(5);
        
        self.withdrawal_queue.push(WithdrawalRequest {
            amount,
            destination,
            approvals: Vec::new(),
            created_at: Clock::get()?.unix_timestamp,
        });
        
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
