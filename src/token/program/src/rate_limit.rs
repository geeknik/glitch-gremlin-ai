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
    pub fn check_rate_limit(
        rate_limit_info: &mut RateLimitInfo,
        clock: &Clock,
    ) -> ProgramResult {
        let current_time = clock.unix_timestamp;
        let window_size = 60; // 1 minute window
        
        // Reset window if needed
        if current_time - rate_limit_info.window_start >= window_size {
            rate_limit_info.window_start = current_time;
            rate_limit_info.request_count = 0;
        }

        // Check if we're over the limit
        if rate_limit_info.request_count >= 3 { // Max 3 requests per minute
            return Err(GlitchError::RateLimitExceeded.into());
        }

        // Check cooldown between requests
        if current_time - rate_limit_info.last_request < 2 { // 2 second cooldown
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
    ) -> ProgramResult {
        if window_size <= 0 || window_size > 3600 {
            return Err(GlitchError::InvalidRateLimit.into());
        }
        if max_requests == 0 || max_requests > 100 {
            return Err(GlitchError::InvalidRateLimit.into());
        }
        if cooldown < 0 || cooldown > window_size {
            return Err(GlitchError::InvalidRateLimit.into());
        }
        Ok(())
    }
}
