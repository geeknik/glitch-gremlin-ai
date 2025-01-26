use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    clock::Clock,
    sysvar::Sysvar,
};
use crate::error::GlitchError;
use crate::state::RateLimitInfo;

pub struct RateLimiter;

impl RateLimiter {
    #[inline(never)]
    #[cfg_attr(not(test), no_mangle)]
    pub fn check_rate_limit(
        rate_limit_info: &mut RateLimitInfo,
        clock: &Clock,
        config: &RateLimitConfig,
    ) -> ProgramResult {
        // DESIGN.md 9.6.4 Memory Safety
        std::arch::asm!("mfence"); // Memory barrier
        std::arch::asm!("lfence"); // Speculative execution barrier
        let current_time = clock.unix_timestamp;
        
        // Dynamic request pricing (DESIGN.md 9.1 and 9.3)
        let requests_per_hour = rate_limit_info.request_count.saturating_mul(3600);
        
        // Apply governance-based multiplier
        let governance_multiplier = if let Some(proposal) = Self::get_active_proposal(program_id)? {
            // Higher costs during active proposals
            2.0
        } else {
            1.0
        };
        
        let dynamic_multiplier = ((requests_per_hour as f64 / 15.0).exp() * governance_multiplier)
            .max(1.0)
            .min(1000.0); // Cap at 1000x

        // Add entropy source for pricing randomization
        let entropy = Clock::get()?.slot.wrapping_mul(0xDEADBEEF);
        let jitter = (entropy % 10) as f64 / 100.0; // ±5% randomization
        let dynamic_multiplier = dynamic_multiplier * (1.0 + jitter);
            
        // State-contingent throttling (DESIGN.md 9.1)
        if rate_limit_info.failed_requests > 5 {
            msg!("Rate limit exceeded: {} failed requests", rate_limit_info.failed_requests);
            // Enforce 9.1 cryptoeconomic safeguards
            let token_balance = TokenManager::get_balance(rate_limit_info.token_account)
                .map_err(|e| {
                    msg!("Failed to get token balance: {}", e);
                    GlitchError::TokenBalanceError
                })?;
            
            // Calculate burn (70%) and insurance (30%) splits
            let burn_amount = token_balance * 70 / 100;
            let insurance_amount = token_balance - burn_amount;
            
            // Execute burns and transfers
            TokenManager::burn_tokens(rate_limit_info.token_account, burn_amount)?;
            // Validate insurance fund account
            let insurance_account = next_account_info(account_info_iter)?;
            Self::validate_token_account(insurance_account, program_id)?;

            TokenManager::transfer_tokens(
                rate_limit_info.token_account,
                insurance_account.key,
                insurance_amount
            )?;
            
            msg!("Enforced safeguards: Burned {} (70%) Sent {} (30%) to insurance", 
                burn_amount, insurance_amount);
            return Err(GlitchError::RateLimitExceededWithBurn.into());
        }

        // Dynamic window reset
        if current_time - rate_limit_info.window_start >= config.window_duration {
            rate_limit_info.window_start = current_time;
            rate_limit_info.request_count = 0;
        }

        // Check sliding window limit
        if rate_limit_info.request_count >= config.max_requests {
            return Err(GlitchError::RateLimitExceeded.into());
        }

        // Enforce cooldown period
        if current_time - rate_limit_info.last_request < config.min_interval {
            return Err(GlitchError::RateLimitExceeded.into());
        }

        // Update rate limit info
        rate_limit_info.request_count += 1;
        rate_limit_info.last_request = current_time;

        Ok(())
    }

    pub fn validate_rate_limit_params(
        window_size: i64,
        max_requests: u32,
        cooldown: i64,
        config: &RateLimitConfig,
    ) -> ProgramResult {
        // Validate parameters according to 9.1 specs
        // Validate parameters against DESIGN.md 9.1 specs
        if window_size <= 0 || window_size > 86400 {
            return Err(GlitchError::InvalidRateLimit.into()); // Max 24h window
        }
        if max_requests == 0 || max_requests > 1000 {
            return Err(GlitchError::InvalidRateLimit.into());
        }
        if cooldown < 0 || cooldown > window_size {
            return Err(GlitchError::InvalidRateLimit.into());
        }
        if config.burn_percentage > 50 {
            return Err(GlitchError::InvalidBurnPercentage.into()); // More specific error
        }
        if config.dynamic_pricing_factor > 1000 {
            return Err(GlitchError::InvalidPricingFactor.into()); // More specific error
        }
        if config.dynamic_pricing_factor < 1 {
            return Err(GlitchError::InvalidPricingFactor.into());
        }
        Ok(())
    }
}
