//! Chaos Request Management
//! 
//! This module handles the lifecycle and processing of chaos test requests in the
//! Glitch Gremlin Program. It provides functionality for:
//! 
//! - Creating and validating chaos test requests
//! - Managing request parameters and configurations
//! - Tracking request status and progress
//! - Storing and retrieving test results
//! 
//! The module ensures that all chaos tests are properly authorized, tracked,
//! and executed according to the specified parameters.

use solana_program::pubkey::Pubkey;
use anchor_lang::prelude::*;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// Gets the current Unix timestamp
fn get_current_timestamp() -> i64 {
    #[cfg(not(feature = "test"))]
    {
        match Clock::get() {
            Ok(clock) => clock.unix_timestamp,
            Err(_) => SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64
        }
    }

    #[cfg(feature = "test")]
    {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }
}

/// Error codes for chaos request operations
#[error_code]
pub enum ChaosRequestError {
    /// Invalid parameter value provided
    #[msg("Invalid parameter value")]
    InvalidParameter,
    
    /// Required parameter missing
    #[msg("Missing required parameter")]
    MissingParameter,
    
    /// Request exceeds allowed duration
    #[msg("Request duration exceeds maximum allowed")]
    DurationExceeded,

    /// Invalid test type specified
    #[msg("Invalid test type specified")]
    InvalidTestType,

    /// Transaction limit exceeded
    #[msg("Transaction limit exceeded")]
    TransactionLimitExceeded,

    /// Request already expired
    #[msg("Request has expired")]
    RequestExpired,
}

/// Valid test types for chaos requests
#[derive(Debug, Clone, PartialEq)]
pub enum TestType {
    /// Fuzzing test that sends random or malformed data to program instructions
    /// 
    /// Parameters:
    /// - mutation_rate: Percentage of inputs to mutate (0-100)
    /// - seed: Optional seed for reproducible fuzzing
    /// - target_instructions: Specific instructions to fuzz, or "all"
    Fuzz,

    /// Load testing to stress program performance under high transaction volume
    /// 
    /// Parameters:
    /// - tps: Target transactions per second
    /// - duration: Test duration in seconds
    /// - ramp_up: Gradual increase in load (seconds)
    LoadTest,

    /// Security analysis scanning for common vulnerabilities
    /// 
    /// Parameters:
    /// - scan_depth: Depth of analysis (shallow, medium, deep)
    /// - vuln_categories: Categories to scan (buffer, arithmetic, access, etc)
    /// - ignore_false_positives: Whether to filter likely false positives
    SecurityScan,

    /// Tests program behavior under concurrent transaction loads
    /// 
    /// Parameters:
    /// - thread_count: Number of concurrent execution threads
    /// - interleave_ratio: Ratio of overlapping transactions
    /// - conflict_percentage: Percentage of conflicting transactions
    ConcurrencyTest,

    /// Custom test type with user-defined parameters
    /// 
    /// # Arguments
    /// * `name` - Name of the custom test type
    Custom(String),
}

impl TestType {
    /// Parse test type from string
    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "fuzz" => Ok(TestType::Fuzz),
            "load_test" => Ok(TestType::LoadTest),
            "security_scan" => Ok(TestType::SecurityScan),
            "concurrency_test" => Ok(TestType::ConcurrencyTest),
            custom => Ok(TestType::Custom(custom.to_string())),
        }
    }

    /// Gets the default parameters for this test type
    pub fn default_parameters(&self) -> HashMap<String, String> {
        let mut params = HashMap::new();
        match self {
            TestType::Fuzz => {
                params.insert("mutation_rate".to_string(), "10".to_string());
                params.insert("target_instructions".to_string(), "all".to_string());
            },
            TestType::LoadTest => {
                params.insert("tps".to_string(), "1000".to_string());
                params.insert("ramp_up".to_string(), "30".to_string());
            },
            TestType::SecurityScan => {
                params.insert("scan_depth".to_string(), "medium".to_string());
                params.insert("vuln_categories".to_string(), "all".to_string());
                params.insert("ignore_false_positives".to_string(), "true".to_string());
            },
            TestType::ConcurrencyTest => {
                params.insert("thread_count".to_string(), "4".to_string());
                params.insert("interleave_ratio".to_string(), "0.5".to_string());
                params.insert("conflict_percentage".to_string(), "20".to_string());
            },
            TestType::Custom(_) => {},
        }
        // Common parameters for all test types
        params.insert("duration_seconds".to_string(), "300".to_string());
        params.insert("max_transactions".to_string(), "10000".to_string());
        params
    }

    /// Validates parameters specific to this test type
    pub fn validate_parameters(&self, params: &HashMap<String, String>) -> Result<()> {
        match self {
            TestType::Fuzz => {
                if let Some(rate) = params.get("mutation_rate") {
                    let rate: u32 = rate.parse().map_err(|_| {
                        msg!("Invalid mutation rate");
                        error!(ChaosRequestError::InvalidParameter)
                    })?;
                    if rate > 100 {
                        msg!("Mutation rate must be between 0 and 100");
                        return Err(error!(ChaosRequestError::InvalidParameter));
                    }
                }
            },
            TestType::LoadTest => {
                if let Some(tps) = params.get("tps") {
                    let tps: u32 = tps.parse().map_err(|_| {
                        msg!("Invalid TPS value");
                        error!(ChaosRequestError::InvalidParameter)
                    })?;
                    const MAX_TPS: u32 = 50_000;
                    if tps > MAX_TPS {
                        msg!("TPS exceeds maximum allowed: {}", MAX_TPS);
                        return Err(error!(ChaosRequestError::InvalidParameter));
                    }
                }
            },
            TestType::SecurityScan => {
                if let Some(depth) = params.get("scan_depth") {
                    match depth.to_lowercase().as_str() {
                        "shallow" | "medium" | "deep" => {},
                        _ => {
                            msg!("Invalid scan depth. Must be shallow, medium, or deep");
                            return Err(error!(ChaosRequestError::InvalidParameter));
                        }
                    }
                }
            },
            TestType::ConcurrencyTest => {
                if let Some(threads) = params.get("thread_count") {
                    let threads: u32 = threads.parse().map_err(|_| {
                        msg!("Invalid thread count");
                        error!(ChaosRequestError::InvalidParameter)
                    })?;
                    const MAX_THREADS: u32 = 32;
                    if threads > MAX_THREADS {
                        msg!("Thread count exceeds maximum allowed: {}", MAX_THREADS);
                        return Err(error!(ChaosRequestError::InvalidParameter));
                    }
                }
            },
            TestType::Custom(_) => {},
        }
        Ok(())
    }

    /// Gets a description of the test type
    pub fn description(&self) -> &'static str {
        match self {
            TestType::Fuzz => "Fuzzing test that sends random or malformed data to program instructions",
            TestType::LoadTest => "Load testing to stress program performance under high transaction volume",
            TestType::SecurityScan => "Security analysis scanning for common vulnerabilities",
            TestType::ConcurrencyTest => "Tests program behavior under concurrent transaction loads",
            TestType::Custom(_) => "Custom test type with user-defined parameters",
        }
    }
}

/// Status of a chaos test request
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ChaosRequestStatus {
    /// Request is pending execution
    Pending,
    /// Request is currently being processed
    InProgress,
    /// Request completed successfully
    Completed,
    /// Request failed during execution
    Failed,
    /// Request was cancelled
    Cancelled,
    /// Request timed out during execution
    TimedOut,
}

/// Structure representing a chaos test request
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ChaosRequest {
    /// Authority that created the request
    pub authority: Pubkey,
    /// Target program to test
    pub target_program: Pubkey,
    /// Parameters for the chaos test
    pub parameters: HashMap<String, String>,
    /// Current status of the request
    pub status: ChaosRequestStatus,
    /// Timestamp when request was created
    pub created_at: i64,
    /// Timestamp when request was last updated
    pub updated_at: i64,
    /// Optional result data from the chaos test
    pub result: Option<String>,
}

impl ChaosRequest {
    /// Creates a new chaos request
    ///
    /// # Arguments
    /// * `authority` - Public key of request creator
    /// * `target_program` - Public key of program to test
    /// * `parameters` - Test configuration parameters
    ///
    /// # Returns
    /// * `Self` - New ChaosRequest instance
    pub fn new(
        authority: Pubkey,
        target_program: Pubkey,
        parameters: HashMap<String, String>,
    ) -> Self {
        let now = get_current_timestamp();
        Self {
            authority,
            target_program,
            parameters,
            status: ChaosRequestStatus::Pending,
            created_at: now,
            updated_at: now,
            result: None,
        }
    }

    /// Creates a new chaos request with default parameters for the given test type
    ///
    /// # Arguments
    /// * `authority` - Public key of request creator
    /// * `target_program` - Public key of program to test
    /// * `test_type` - Type of chaos test to run
    ///
    /// # Returns
    /// * `Self` - New ChaosRequest instance with default parameters
    pub fn new_with_defaults(
        authority: Pubkey,
        target_program: Pubkey,
        test_type: TestType,
    ) -> Self {
        let parameters = test_type.default_parameters();
        Self::new(authority, target_program, parameters)
    }

    /// Validates the request parameters
    ///
    /// # Returns
    /// * `Result<()>` - Success or validation error
    pub fn validate(&self) -> Result<()> {
        // Check required parameters
        let required_params = ["test_type", "duration_seconds", "max_transactions"];
        for param in required_params {
            if !self.parameters.contains_key(param) {
                msg!("Missing required parameter: {}", param);
                return Err(error!(ChaosRequestError::MissingParameter));
            }
        }

        // Get and validate test type
        let test_type = self.get_test_type()?;
        
        // Validate test-specific parameters
        test_type.validate_parameters(&self.parameters)?;

        // Validate duration
        if let Some(duration) = self.parameters.get("duration_seconds") {
            let duration: u64 = duration.parse().map_err(|_| {
                msg!("Invalid duration format");
                error!(ChaosRequestError::InvalidParameter)
            })?;
            
            const MAX_DURATION: u64 = 3600; // 1 hour
            if duration > MAX_DURATION {
                msg!("Duration {} exceeds maximum allowed {}", duration, MAX_DURATION);
                return Err(error!(ChaosRequestError::DurationExceeded));
            }
        }

        // Validate transaction limit
        if let Some(max_txns) = self.parameters.get("max_transactions") {
            let max_txns: u64 = max_txns.parse().map_err(|_| {
                msg!("Invalid max_transactions format");
                error!(ChaosRequestError::InvalidParameter)
            })?;
            
            const MAX_TRANSACTIONS: u64 = 100_000;
            if max_txns > MAX_TRANSACTIONS {
                msg!("Transaction limit {} exceeds maximum allowed {}", max_txns, MAX_TRANSACTIONS);
                return Err(error!(ChaosRequestError::TransactionLimitExceeded));
            }
        }

        Ok(())
    }

    /// Updates the request status
    ///
    /// # Arguments
    /// * `status` - New status to set
    pub fn update_status(&mut self, status: ChaosRequestStatus) {
        self.status = status;
        self.updated_at = get_current_timestamp();
    }

    /// Sets the result data for the request
    ///
    /// # Arguments
    /// * `result` - Result data to store
    pub fn set_result(&mut self, result: String) {
        self.result = Some(result);
        self.updated_at = get_current_timestamp();
    }

    /// Checks if the request has expired
    ///
    /// # Returns
    /// * `Result<bool>` - Whether request has expired or error
    pub fn check_expiry(&self) -> Result<bool> {
        if let Some(duration) = self.parameters.get("duration_seconds") {
            let duration: i64 = duration.parse().map_err(|_| {
                msg!("Invalid duration format");
                error!(ChaosRequestError::InvalidParameter)
            })?;
            
            let now = get_current_timestamp();
            return Ok(now - self.created_at > duration);
        }
        
        Ok(false)
    }

    /// Gets the test type for this request
    ///
    /// # Returns
    /// * `Result<TestType>` - Test type or error
    pub fn get_test_type(&self) -> Result<TestType> {
        let test_type = self.parameters.get("test_type").ok_or_else(|| {
            msg!("Missing test_type parameter");
            error!(ChaosRequestError::MissingParameter)
        })?;
        
        TestType::from_str(test_type)
    }

    /// Gets a description of the current test
    ///
    /// # Returns
    /// * `Result<String>` - Test description or error
    pub fn get_description(&self) -> Result<String> {
        let test_type = self.get_test_type()?;
        Ok(format!("{}\nTarget Program: {}\nCreated: {}\nStatus: {:?}",
            test_type.description(),
            self.target_program,
            self.created_at,
            self.status
        ))
    }
} 