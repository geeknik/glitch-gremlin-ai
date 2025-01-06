#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Clock;

    #[test]
    fn test_rate_limit_check() {
        let mut rate_limit_info = RateLimitInfo {
            last_request: 0,
            request_count: 0,
            window_start: 0,
        };

        let clock = Clock {
            slot: 0,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: 100,
        };

        // First request should succeed
        assert!(RateLimiter::check_rate_limit(&mut rate_limit_info, &clock).is_ok());
        
        // Second immediate request should fail (2 second cooldown)
        assert!(RateLimiter::check_rate_limit(&mut rate_limit_info, &clock).is_err());

        // After window reset should succeed
        rate_limit_info.window_start = 0;
        rate_limit_info.request_count = 0;
        rate_limit_info.last_request = 98; // 2 seconds ago
        assert!(RateLimiter::check_rate_limit(&mut rate_limit_info, &clock).is_ok());
    }

    #[test]
    fn test_validate_rate_limit_params() {
        // Valid parameters
        assert!(RateLimiter::validate_rate_limit_params(60, 3, 2).is_ok());

        // Invalid window size
        assert!(RateLimiter::validate_rate_limit_params(0, 3, 2).is_err());
        assert!(RateLimiter::validate_rate_limit_params(3601, 3, 2).is_err());

        // Invalid max requests
        assert!(RateLimiter::validate_rate_limit_params(60, 0, 2).is_err());
        assert!(RateLimiter::validate_rate_limit_params(60, 101, 2).is_err());

        // Invalid cooldown
        assert!(RateLimiter::validate_rate_limit_params(60, 3, -1).is_err());
        assert!(RateLimiter::validate_rate_limit_params(60, 3, 61).is_err());
    }
}
