//! Basic example demonstrating core functionality of the Glitch Gremlin Program
//! 
//! This example shows how to:
//! - Initialize governance state
//! - Create and process chaos requests
//! - Handle basic program interactions
//! - Use different test types and validation
//! - Manage test parameters and configurations
//! 
//! For more advanced examples, see the other files in the examples directory.

extern crate serde;
extern crate thiserror;

use serde::{Serialize, Deserialize};
use solana_program::pubkey::Pubkey;
use glitch_gremlin_program::{
    state::chaos_request::{TestType, ChaosRequestStatus as CoreChaosRequestStatus},
    rpc::helius_client::{HeliusClient, HeliusConfig},
};

// Standard library imports for core functionality
use std::{
    collections::{HashMap, HashSet},
    io::Write,
    sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}},
    time::{Duration, Instant, SystemTime},
};

// External crates
use anyhow::{Result, Context};
use thiserror::Error;
use redis::{
    Client as RedisClient, 
    Commands, 
    FromRedisValue, 
    ToRedisArgs,
    Value as RedisValue,
    ErrorKind,
};
use time::{OffsetDateTime, Time};

// Add Redis and environment imports
use std::env;

// Add CacheError definition
#[derive(Debug, Error)]
pub enum CacheError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Connection error: {0}")]
    Connection(String),
    
    #[error("Value not found for key: {0}")]
    NotFound(String),
    
    #[error("Invalid data format: {0}")]
    InvalidFormat(String),
}

// Add CacheMetrics definition
#[derive(Debug, Default)]
pub struct CacheMetrics {
    pub total_operations: usize,
    pub cache_hits: usize,
    pub cache_misses: usize,
    pub stale_entries_cleared: usize,
    pub last_write: Option<SystemTime>,
    pub last_cleanup: Option<SystemTime>,
}

// Add EnhancedRedisClient definition
#[derive(Clone)]
pub struct EnhancedRedisClient {
    client: RedisClient,
    metrics: Arc<Mutex<CacheMetrics>>,
}

impl EnhancedRedisClient {
    pub fn new(host: &str, port: u16) -> Result<Self, CacheError> {
        let client = RedisClient::open(format!("redis://{}:{}", host, port))
            .map_err(|e| CacheError::Connection(e.to_string()))?;
            
        Ok(Self {
            client,
            metrics: Arc::new(Mutex::new(CacheMetrics::default())),
        })
    }

    pub async fn set_cached_status(&self, program_id: &Pubkey, status: &CoreChaosRequestStatus) -> Result<(), CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let key = format!("request_status:{}", program_id);
        let serialized = serde_json::to_string(&SerializableChaosRequestStatus(status.clone()))
            .map_err(CacheError::Serialization)?;

        let mut pipe = redis::pipe();
        pipe.atomic()
            .hset(&key, "status", serialized)
            .hset(&key, "last_update", SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs() as i64)
            .expire(&key, CACHE_TTL_SECS as usize)
            .query(&mut conn)
            .map_err(CacheError::Redis)?;

        if let Ok(mut metrics) = self.metrics.lock() {
            metrics.total_operations += 1;
            metrics.last_write = Some(SystemTime::now());
        }

        Ok(())
    }

    pub async fn get_cached_timestamp(&self, key: &str) -> Result<Option<i64>, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        if let Ok(Some(timestamp)) = redis_hget::<_, _, i64>(&mut conn, &key, "last_update").await {
            if let Ok(mut metrics) = self.metrics.lock() {
                metrics.total_operations += 1;
                metrics.cache_hits += 1;
            }
            Ok(Some(timestamp))
        } else {
            if let Ok(mut metrics) = self.metrics.lock() {
                metrics.total_operations += 1;
                metrics.cache_misses += 1;
            }
            Ok(None)
        }
    }

    pub async fn clear_expired_entries(&self) -> Result<u64, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let mut cleared = 0;
        let keys: Vec<String> = conn.keys(CACHE_INVALIDATION_PATTERN)
            .map_err(CacheError::Redis)?;

        for key in keys {
            if let Ok(Some(timestamp)) = redis_hget::<_, _, i64>(&mut conn, &key, "last_update").await {
                let age = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64 - timestamp;

                if age > CACHE_STALE_THRESHOLD_SECS as i64 {
                    conn.del(&key).map_err(CacheError::Redis)?;
                    cleared += 1;
                }
            }
        }

        if let Ok(mut metrics) = self.metrics.lock() {
            metrics.stale_entries_cleared += cleared as usize;
            metrics.last_cleanup = Some(SystemTime::now());
        }

        Ok(cleared)
    }
}

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorType {
    RateLimit,
    Timeout,
    Network,
    Authorization,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    BackOff {
        duration: u64,  // Store duration as u64 milliseconds for serialization
        reason: String,
    },
    Retry {
        max_attempts: u32,
        reason: String,
    },
    SwitchEndpoint {
        reason: String,
    },
    Alert {
        message: String,
    },
}

impl RecoveryAction {
    pub fn get_duration(&self) -> Option<Duration> {
        match self {
            RecoveryAction::BackOff { duration, .. } => Some(Duration::from_millis(*duration)),
            _ => None,
        }
    }

    pub fn get_reason(&self) -> &str {
        match self {
            RecoveryAction::BackOff { reason, .. } => reason,
            RecoveryAction::Retry { reason, .. } => reason,
            RecoveryAction::SwitchEndpoint { reason } => reason,
            RecoveryAction::Alert { message } => message,
        }
    }
}

/// Enhanced error tracking with timestamps and categorization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEntry {
    pub timestamp: u64,
    pub error: String,
    pub error_type: ErrorType,
    pub program_id: Option<Pubkey>,
    pub request_id: Option<String>,
    pub recovery_attempts: usize,
}

/// Analysis of error patterns and trends
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorAnalysis {
    pub total_errors: usize,
    pub error_types: HashMap<ErrorType, usize>,
    pub error_timeline: Vec<(u64, ErrorType)>,
    pub peak_error_rate: f64,
    pub avg_recovery_time: Duration,
    pub most_affected_programs: HashMap<Pubkey, usize>,
}

/// Entry for error timeline analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorTimelineEntry {
    pub timestamp: u64,
    pub error_type: ErrorType,
    pub program_id: Pubkey,
    pub recovery_action: Option<RecoveryAction>,
    pub resolution_time: Option<Duration>,
}

// Constants for security thresholds
const MAX_GLOBAL_TRANSITIONS_PER_SEC: usize = 1000;
const MIN_TRANSITION_INTERVAL_MS: u64 = 50;
const MAX_TRANSITIONS_PER_STATUS: usize = 100;
const SECURITY_TIME_WINDOW_SECS: u64 = 60;

// Add security timestamp validation
const MAX_TIMESTAMP_SKEW_SECS: u64 = 300; // 5 minutes maximum clock skew allowed

// Add Redis configuration constants
const REDIS_HOST: &str = "r.glitchgremlin.ai";
const REDIS_PORT: u16 = 6379;
const CACHE_TTL_SECS: u64 = 3600; // 1 hour cache TTL
const MAX_DAILY_REQUESTS: u32 = 10_000;

// Add cache configuration constants
const CACHE_WARM_BATCH_SIZE: usize = 50;
const CACHE_STALE_THRESHOLD_SECS: u64 = 300; // 5 minutes
const CACHE_INVALIDATION_PATTERN: &str = "request_status:*";
const CACHE_WARM_INTERVAL_SECS: u64 = 60;

// Add rate limiting constants
const RATE_LIMIT_WINDOW_SECS: u64 = 60;
const HIGH_PRIORITY_MULTIPLIER: f64 = 1.5;
const BURST_ALLOWANCE: u32 = 100;

// Add error recovery constants
const CIRCUIT_BREAKER_THRESHOLD: usize = 5;
const CIRCUIT_BREAKER_RESET_SECS: u64 = 300;
const MAX_ERROR_HISTORY: usize = 1000;

/// Network configuration for test execution
#[derive(Debug, Clone)]
struct NetworkConfig {
    cluster: SolanaCluster,
    commitment: String,
    test_mode: TestMode,
    /// Rate limit for RPC requests (requests per second)
    rate_limit: Option<u32>,
    /// Retry configuration
    retry_config: RetryConfig,
}

/// Configuration for request retries with enhanced metrics
#[derive(Debug, Clone)]
struct RetryConfig {
    max_retries: u64,  // Changed from u32 to u64 for consistency
    base_delay_ms: u64,
    max_delay_ms: u64,
    /// Jitter range in milliseconds (0-100)
    jitter_range_ms: u64,
    /// Whether to use exponential backoff
    use_exponential: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay_ms: 500,
            max_delay_ms: 5000,
            jitter_range_ms: 100,
            use_exponential: true,
        }
    }
}

/// Available Solana clusters with enhanced configuration
#[derive(Debug, Clone, PartialEq)]
enum SolanaCluster {
    Mainnet,
    Devnet,
    Testnet,
    Localnet,
    Custom {
        name: String,
        rpc_url: String,
        ws_url: Option<String>,
    },
}

impl SolanaCluster {
    fn name(&self) -> String {
        match self {
            SolanaCluster::Mainnet => "Mainnet".to_string(),
            SolanaCluster::Devnet => "Devnet".to_string(),
            SolanaCluster::Testnet => "Testnet".to_string(),
            SolanaCluster::Localnet => "Localnet".to_string(),
            SolanaCluster::Custom { name, .. } => format!("Custom ({})", name),
        }
    }

    fn rpc_url(&self) -> String {
        match self {
            SolanaCluster::Mainnet => "https://api.mainnet-beta.solana.com".to_string(),
            SolanaCluster::Devnet => "https://api.devnet.solana.com".to_string(),
            SolanaCluster::Testnet => "https://api.testnet.solana.com".to_string(),
            SolanaCluster::Localnet => "http://127.0.0.1:8899".to_string(),
            SolanaCluster::Custom { rpc_url, .. } => rpc_url.clone(),
        }
    }

    fn ws_url(&self) -> Option<String> {
        match self {
            SolanaCluster::Mainnet => Some("wss://api.mainnet-beta.solana.com".to_string()),
            SolanaCluster::Devnet => Some("wss://api.devnet.solana.com".to_string()),
            SolanaCluster::Testnet => Some("wss://api.testnet.solana.com".to_string()),
            SolanaCluster::Localnet => Some("ws://127.0.0.1:8900".to_string()),
            SolanaCluster::Custom { ws_url, .. } => ws_url.clone(),
        }
    }

    fn is_local(&self) -> bool {
        matches!(self, SolanaCluster::Localnet)
    }

    fn requires_api_key(&self) -> bool {
        matches!(self, SolanaCluster::Mainnet | SolanaCluster::Custom { .. })
    }

    fn get_network_tier(&self) -> &'static str {
        match self {
            SolanaCluster::Mainnet => "production",
            SolanaCluster::Devnet => "development",
            SolanaCluster::Testnet => "testing",
            SolanaCluster::Localnet => "local",
            SolanaCluster::Custom { .. } => "custom",
        }
    }

    fn get_recommended_commitment(&self) -> &'static str {
        match self {
            SolanaCluster::Mainnet => "finalized",
            SolanaCluster::Devnet | SolanaCluster::Testnet => "confirmed",
            SolanaCluster::Localnet | SolanaCluster::Custom { .. } => "processed",
        }
    }

    fn get_rate_limits(&self) -> Option<(u32, Duration)> {
        match self {
            SolanaCluster::Mainnet => Some((100, Duration::from_secs(1))), // 100 req/s
            SolanaCluster::Devnet => Some((50, Duration::from_secs(1))),   // 50 req/s
            SolanaCluster::Testnet => Some((25, Duration::from_secs(1))),  // 25 req/s
            SolanaCluster::Localnet => None,                               // No limits
            SolanaCluster::Custom { .. } => Some((200, Duration::from_secs(1))), // Custom high limit
        }
    }
}

/// Test execution modes with enhanced configuration
#[derive(Debug, Clone, Copy, PartialEq)]
enum TestMode {
    /// Real transactions on network
    Live {
        /// Maximum concurrent requests
        max_concurrent: u32,
        /// Transaction confirmation level
        confirm_level: u8,
    },
    /// Mock responses for testing
    Mock {
        /// Simulated latency in ms
        latency_ms: u32,
        /// Error rate percentage (0-100)
        error_rate: u8,
    },
    /// Simulation without committing
    Simulate {
        /// Simulation speed multiplier
        speed_multiplier: f32,
        /// Include state changes
        track_state: bool,
    },
}

impl TestMode {
    /// Get the recommended timeout for this mode
    fn get_timeout_secs(&self) -> u64 {
        match self {
            TestMode::Live { max_concurrent, .. } => {
                // Scale timeout based on concurrency
                120 + (max_concurrent * 10) as u64
            }
            TestMode::Mock { latency_ms, .. } => {
                // Scale timeout based on simulated latency
                30 + ((*latency_ms as u64) / 1000)
            }
            TestMode::Simulate { speed_multiplier, .. } => {
                // Adjust timeout based on simulation speed
                (60.0 / *speed_multiplier as f32) as u64
            }
        }
    }

    /// Get the recommended poll interval with improved timing
    fn get_poll_interval(&self) -> Duration {
        match self {
            TestMode::Live { .. } => Duration::from_secs(5),
            TestMode::Mock { latency_ms, .. } => Duration::from_millis(*latency_ms as u64),
            TestMode::Simulate { speed_multiplier, .. } => {
                Duration::from_secs_f64(1.0 / (*speed_multiplier as f64))
            }
        }
    }

    /// Simulates state changes based on test mode
    fn simulate_state_metrics(&self, checks: usize) -> StateMetrics {
        match self {
            TestMode::Live { max_concurrent, .. } => {
                // Real-world like resource usage
                StateMetrics {
                    checks_in_state: checks,
                    memory_usage: 1000 + (checks as u64 * 500), // 500KB per check
                    cpu_usage: 0.1 + (checks as f64 * 0.01).min(0.8), // Max 80% CPU
                    error_count: if checks % ((*max_concurrent as usize) * 10) == 0 { 1 } else { 0 },
                    start_time: std::time::Instant::now(),
                    last_update: std::time::Instant::now(),
                    status_history: Vec::new(),
                    // Initialize enhanced metrics
                    peak_memory_usage: 0,
                    peak_cpu_usage: 0.0,
                    avg_check_duration: Duration::from_secs(0),
                    total_check_duration: Duration::from_secs(0),
                    check_count: 0,
                }
            }
            TestMode::Mock { error_rate, .. } => {
                // Simulated errors based on error rate
                StateMetrics {
                    checks_in_state: checks,
                    memory_usage: 500 + (checks as u64 * 100), // Light memory usage
                    cpu_usage: 0.05 + (checks as f64 * 0.005), // Low CPU usage
                    error_count: if rand::random::<u8>() < *error_rate { 1 } else { 0 },
                    start_time: std::time::Instant::now(),
                    last_update: std::time::Instant::now(),
                    status_history: Vec::new(),
                    // Initialize enhanced metrics
                    peak_memory_usage: 0,
                    peak_cpu_usage: 0.0,
                    avg_check_duration: Duration::from_secs(0),
                    total_check_duration: Duration::from_secs(0),
                    check_count: 0,
                }
            }
            TestMode::Simulate { speed_multiplier, .. } => {
                // Accelerated simulation metrics
                let multiplier = *speed_multiplier as f64;
                StateMetrics {
                    checks_in_state: checks,
                    memory_usage: if true { 
                        2000 + (checks as f64 * 200.0 * multiplier) as u64 
                    } else { 
                        500 + (checks as f64 * 50.0 * multiplier) as u64 
                    },
                    cpu_usage: 0.2 + ((checks as f64 * 0.02 * multiplier).min(0.95)),
                    error_count: if checks % (10 * multiplier.round() as usize) == 0 { 1 } else { 0 },
                    start_time: std::time::Instant::now(),
                    last_update: std::time::Instant::now(),
                    status_history: Vec::new(),
                    // Initialize enhanced metrics
                    peak_memory_usage: 0,
                    peak_cpu_usage: 0.0,
                    avg_check_duration: Duration::from_secs(0),
                    total_check_duration: Duration::from_secs(0),
                    check_count: 0,
                }
            }
        }
    }

    /// Get mode description
    fn description(&self) -> String {
        match self {
            TestMode::Live { max_concurrent, confirm_level } => {
                format!("LIVE (max_concurrent={}, confirm_level={})", 
                    max_concurrent, confirm_level)
            }
            TestMode::Mock { latency_ms, error_rate } => {
                format!("MOCK (latency={}ms, error_rate={}%)", 
                    latency_ms, error_rate)
            }
            TestMode::Simulate { speed_multiplier, track_state } => {
                format!("SIMULATION (speed={}x, track_state={})",
                    speed_multiplier, track_state)
            }
        }
    }

    /// Create default test mode configuration
    fn default_live() -> Self {
        TestMode::Live {
            max_concurrent: 5,
            confirm_level: 1,
        }
    }

    fn default_mock() -> Self {
        TestMode::Mock {
            latency_ms: 500,
            error_rate: 10,
        }
    }

    fn default_simulate() -> Self {
        TestMode::Simulate {
            speed_multiplier: 2.0,
            track_state: true,
        }
    }

    fn default_mainnet() -> Self {
        TestMode::Live {
            max_concurrent: 2,  // Conservative for mainnet
            confirm_level: 2,   // Higher confirmation requirement
        }
    }

    fn default_testnet() -> Self {
        TestMode::Live {
            max_concurrent: 8,  // More aggressive for testnet
            confirm_level: 1,   // Lower confirmation requirement
        }
    }

    fn get_network_requirements(&self) -> NetworkRequirements {
        match self {
            TestMode::Live { max_concurrent, confirm_level } => NetworkRequirements {
                min_rpc_nodes: (*max_concurrent as u32).max(3),
                min_confirmation_level: *confirm_level,
                requires_websocket: true,
                requires_archive_node: false,
            },
            TestMode::Mock { .. } => NetworkRequirements {
                min_rpc_nodes: 1,
                min_confirmation_level: 1,
                requires_websocket: false,
                requires_archive_node: false,
            },
            TestMode::Simulate { .. } => NetworkRequirements {
                min_rpc_nodes: 1,
                min_confirmation_level: 1,
                requires_websocket: true,
                requires_archive_node: true,
            },
        }
    }
}

/// Network requirements for different test modes
#[derive(Debug)]
struct NetworkRequirements {
    min_rpc_nodes: u32,
    min_confirmation_level: u8,
    requires_websocket: bool,
    requires_archive_node: bool,
}

/// Creates a network configuration for test execution with enhanced options
fn create_network_config(cluster: SolanaCluster, test_mode: TestMode) -> NetworkConfig {
    NetworkConfig {
        cluster,
        commitment: "confirmed".to_string(),
        test_mode,
        rate_limit: match test_mode {
            TestMode::Live { max_concurrent, .. } => Some(max_concurrent),
            TestMode::Mock { .. } => None,
            TestMode::Simulate { speed_multiplier, .. } => Some((20.0 * speed_multiplier) as u32),
        },
        retry_config: RetryConfig::default(),
    }
}

/// Creates a parameter map with common settings
fn create_base_parameters() -> HashMap<String, String> {
    let mut params = HashMap::new();
    params.insert("duration_seconds".to_string(), "300".to_string());
    params.insert("max_transactions".to_string(), "1000".to_string());
    params.insert("log_level".to_string(), "debug".to_string());
    params.insert("retry_count".to_string(), "3".to_string());
    params
}

/// Creates test-specific parameters based on test type
fn create_test_parameters(test_type: &TestType) -> HashMap<String, String> {
    let mut params = create_base_parameters();
    
    match test_type {
        TestType::Fuzz => {
            params.extend([
                ("test_type".to_string(), "fuzz".to_string()),
                ("mutation_rate".to_string(), "50".to_string()),
                ("seed".to_string(), "12345".to_string()),
                ("target_instructions".to_string(), "all".to_string()),
                ("mutation_strategy".to_string(), "random".to_string()),
            ]);
        },
        TestType::LoadTest => {
            params.extend([
                ("test_type".to_string(), "load_test".to_string()),
                ("tps".to_string(), "5000".to_string()),
                ("ramp_up".to_string(), "60".to_string()),
                ("distribution".to_string(), "exponential".to_string()),
                ("cool_down".to_string(), "30".to_string()),
            ]);
        },
        TestType::SecurityScan => {
            params.extend([
                ("test_type".to_string(), "security_scan".to_string()),
                ("scan_depth".to_string(), "deep".to_string()),
                ("vuln_categories".to_string(), "buffer,arithmetic,access".to_string()),
                ("ignore_false_positives".to_string(), "true".to_string()),
                ("export_format".to_string(), "sarif".to_string()),
            ]);
        },
        TestType::ConcurrencyTest => {
            params.extend([
                ("test_type".to_string(), "concurrency_test".to_string()),
                ("thread_count".to_string(), "16".to_string()),
                ("conflict_percentage".to_string(), "30".to_string()),
                ("interleave_strategy".to_string(), "random".to_string()),
                ("deadlock_detection".to_string(), "enabled".to_string()),
            ]);
        },
        TestType::Custom(name) => {
            params.extend([
                ("test_type".to_string(), "custom".to_string()),
                ("custom_param".to_string(), "value".to_string()),
                ("test_name".to_string(), name.clone()),
                ("custom_mode".to_string(), "advanced".to_string()),
            ]);
        },
    }
    params
}

/// Status update formatting options with enhanced display capabilities
#[derive(Debug, Clone)]
struct StatusFormat {
    use_color: bool,
    show_metrics: bool,
    compact: bool,
    /// Maximum width for progress display
    max_width: usize,
    /// Whether to show timestamps
    show_timestamps: bool,
}

impl Default for StatusFormat {
    fn default() -> Self {
        Self {
            use_color: true,
            show_metrics: true,
            compact: false,
            max_width: 120,
            show_timestamps: true,
        }
    }
}

/// Prints a formatted status update for a chaos request with enhanced visualization
fn print_status_update(request_id: &str, status: &CoreChaosRequestStatus, program: &Pubkey, format: &StatusFormat) -> String {
    let (status_symbol, status_desc, color_code) = match status {
        CoreChaosRequestStatus::Pending => ("⏳", "pending execution", "\x1b[33m"),
        CoreChaosRequestStatus::InProgress => ("🔄", "currently running", "\x1b[36m"),
        CoreChaosRequestStatus::Completed => ("✅", "completed successfully", "\x1b[32m"),
        CoreChaosRequestStatus::Failed => ("❌", "failed to complete", "\x1b[31m"),
        CoreChaosRequestStatus::Cancelled => ("🚫", "cancelled by authority", "\x1b[35m"),
        CoreChaosRequestStatus::TimedOut => ("⌛", "timed out during execution", "\x1b[33m"),
    };
    
    let mut output = String::new();

    // Add timestamp if enabled
    if format.show_timestamps {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        output.push_str(&format!("[{:>10.3}s] ", now.as_secs_f64()));
    }

    // Add status symbol and basic info
    output.push_str(&format!("{} {}", status_symbol, request_id));

    // Add program ID if not compact
    if !format.compact {
        output.push_str(&format!(" for program {}", program.to_string()));
    }

    // Add status description with optional color
    let status_text = if format.use_color {
        format!("{}{}{}\x1b[0m", color_code, status_desc, "\x1b[0m")
    } else {
        status_desc.to_string()
    };
    output.push_str(&format!(" is {}", status_text));

    // Truncate if exceeds max width
    if output.len() > format.max_width {
        output.truncate(format.max_width - 3);
        output.push_str("...");
    }

    output
}

/// Tracks the progress and results of a chaos request
#[derive(Debug)]
struct RequestTracker {
    request_id: String,
    program_id: Pubkey,
    start_time: std::time::Instant,
    last_status: CoreChaosRequestStatus,
    status_changes: Vec<(CoreChaosRequestStatus, std::time::Instant, StateMetrics)>,
    metrics: RequestMetrics,
    network_config: NetworkConfig,  // Add network configuration
}

/// Tracks performance metrics for a request
#[derive(Debug, Default)]
struct RequestMetrics {
    status_check_count: usize,
    total_pending_time: Duration,
    total_in_progress_time: Duration,
    last_check_time: Option<std::time::Instant>,
}

/// Enhanced wrapper around CoreChaosRequestStatus with additional security features
#[derive(Debug, Clone)]
pub struct EnhancedRequestStatus {
    inner: CoreChaosRequestStatus,
    created_at: Instant,
    transition_count: usize,
    last_transition: Option<(CoreChaosRequestStatus, Instant)>,
}

impl EnhancedRequestStatus {
    pub fn new(status: CoreChaosRequestStatus) -> Self {
        Self {
            inner: status,
            created_at: Instant::now(),
            transition_count: 0,
            last_transition: None,
        }
    }

    pub fn inner(&self) -> &CoreChaosRequestStatus {
        &self.inner
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self.inner,
            CoreChaosRequestStatus::Completed |
            CoreChaosRequestStatus::Failed |
            CoreChaosRequestStatus::Cancelled |
            CoreChaosRequestStatus::TimedOut
        )
    }

    pub fn validate_transition(&mut self, new_status: &CoreChaosRequestStatus) -> bool {
        let now = Instant::now();
        
        // Security check: Prevent transitions from terminal states
        if self.is_terminal() {
            println!("⚠️  Security: Attempted transition from terminal state");
            return false;
        }

        // Security check: Rate limiting
        if let Some((_, last_time)) = self.last_transition.as_ref() {
            let elapsed = now.duration_since(*last_time);
            if elapsed < Duration::from_millis(100) {
                println!("⚠️  Security: Rate limit exceeded - transitions too frequent");
                println!("   ├─ Last transition: {:.2}ms ago", elapsed.as_millis());
                println!("   └─ Minimum interval: 100ms");
                return false;
            }
        }

        // Validate state transition rules with enhanced logging
        let valid = match (&self.inner, new_status) {
            (CoreChaosRequestStatus::Pending, CoreChaosRequestStatus::InProgress) => true,
            (CoreChaosRequestStatus::InProgress, CoreChaosRequestStatus::Completed) => true,
            (CoreChaosRequestStatus::InProgress, CoreChaosRequestStatus::Failed) => true,
            (CoreChaosRequestStatus::InProgress, CoreChaosRequestStatus::TimedOut) => true,
            (_, CoreChaosRequestStatus::Cancelled) if !self.is_terminal() => {
                println!("ℹ️  Cancellation requested from state {:?}", self.inner);
                true
            },
            (from, to) => {
                println!("⚠️  Security: Invalid state transition");
                println!("   ├─ From: {:?}", from);
                println!("   ├─ To: {:?}", to);
                println!("   ├─ Total transitions: {}", self.transition_count);
                println!("   └─ Age: {:.2}s", self.age().as_secs_f64());
                false
            }
        };

        if valid {
            // Update transition history with security context
            self.last_transition = Some((self.inner.clone(), now));
            self.transition_count += 1;
            
            // Log successful transition
            println!("✅ Valid state transition");
            println!("   ├─ From: {:?}", self.inner);
            println!("   ├─ To: {:?}", new_status);
            println!("   ├─ Transition #{}", self.transition_count);
            println!("   └─ Total age: {:.2}s", self.age().as_secs_f64());
        }

        valid
    }

    pub fn transition_count(&self) -> usize {
        self.transition_count
    }

    pub fn last_transition_age(&self) -> Option<Duration> {
        self.last_transition.as_ref().map(|(_, time)| time.elapsed())
    }

    pub fn age(&self) -> Duration {
        self.created_at.elapsed()
    }

    /// Get detailed transition metrics
    pub fn get_transition_metrics(&self) -> TransitionMetrics {
        TransitionMetrics {
            total_transitions: self.transition_count,
            age: self.age(),
            last_transition_age: self.last_transition_age(),
            current_state: self.inner.clone(),
            is_terminal: self.is_terminal(),
        }
    }

    /// Check for potential security violations with enhanced rate limiting
    pub fn check_security(&self, security_metrics: &mut SecurityMetrics) -> bool {
        // Check global transition rate with proper type handling
        let global_transitions = GLOBAL_TRANSITION_COUNT.load(Ordering::SeqCst);
        if global_transitions > MAX_GLOBAL_TRANSITIONS_PER_SEC {
            security_metrics.record_violation("GlobalRateExceeded");
            println!("   ⚠️  Security: Global transition rate exceeded");
            println!("   ├─ Current Rate: {} transitions/sec", global_transitions);
            println!("   └─ Maximum Rate: {} transitions/sec", MAX_GLOBAL_TRANSITIONS_PER_SEC);
            return false;
        }

        // Enhanced transition frequency check
        if let Some((_, last_time)) = &self.last_transition {
            let elapsed_ms = last_time.elapsed().as_millis() as u64;
            if elapsed_ms < MIN_TRANSITION_INTERVAL_MS {
                security_metrics.record_violation("TransitionTooFrequent");
                println!("   ⚠️  Security: Transition too frequent");
                println!("   ├─ Elapsed: {}ms", elapsed_ms);
                println!("   └─ Required: {}ms", MIN_TRANSITION_INTERVAL_MS);
                return false;
            }
        }

        // Enhanced transition count check
        if self.transition_count > MAX_TRANSITIONS_PER_STATUS {
            security_metrics.record_violation("ExcessiveTransitions");
            println!("   ⚠️  Security: Excessive transitions detected");
            println!("   ├─ Current Count: {}", self.transition_count);
            println!("   └─ Maximum Allowed: {}", MAX_TRANSITIONS_PER_STATUS);
            return false;
        }

        true
    }

    /// Record a successful transition with security tracking
    fn record_transition(&mut self, new_status: CoreChaosRequestStatus) {
        GLOBAL_TRANSITION_COUNT.fetch_add(1, Ordering::SeqCst);
        self.inner = new_status;
        self.transition_count += 1;
    }
}

impl From<CoreChaosRequestStatus> for EnhancedRequestStatus {
    fn from(status: CoreChaosRequestStatus) -> Self {
        Self::new(status)
    }
}

impl From<EnhancedRequestStatus> for CoreChaosRequestStatus {
    fn from(enhanced: EnhancedRequestStatus) -> Self {
        enhanced.inner
    }
}

/// Enhanced status display with state cache metrics
fn print_enhanced_status(
    tracker: &RequestTracker,
    status: &CoreChaosRequestStatus,
    state_cache: &StateCache,
    format: &StatusFormat,
    elapsed: Duration,
) {
    // Clear line and print progress
    print!("\r\x1B[K");

    // Print status with enhanced metrics
    let status_text = print_status_update(
        &tracker.request_id,
        status,
        &tracker.program_id,
        format
    );

    if format.show_metrics {
        let metrics = tracker.get_metrics();
        let state_metrics = tracker.get_current_state_metrics();
        
        match status {
            CoreChaosRequestStatus::Pending => {
                print!("{} | \x1b[33mWaiting\x1b[0m | Queue: \x1b[36m{:.1}s\x1b[0m | Checks: \x1b[36m{}\x1b[0m", 
                    status_text,
                    metrics.total_pending_time.as_secs_f64(),
                    state_cache.metrics.total_checks
                );
            }
            CoreChaosRequestStatus::InProgress => {
                let progress = match tracker.network_config.test_mode {
                    TestMode::Live { max_concurrent, .. } => 
                        (metrics.status_check_count as f64 / max_concurrent as f64) * 100.0,
                    TestMode::Mock { .. } => 
                        (metrics.status_check_count as f64 / 15.0) * 100.0,
                    TestMode::Simulate { speed_multiplier, .. } => 
                        (metrics.status_check_count as f64 / (20.0 * speed_multiplier) as f64) * 100.0,
                };

                print!("{} | \x1b[36mRunning\x1b[0m | CPU: \x1b[36m{:.1}%\x1b[0m | Mem: \x1b[36m{} KB\x1b[0m | Prog: \x1b[36m{:.1}%\x1b[0m | Trans: \x1b[36m{}\x1b[0m", 
                    status_text,
                    state_metrics.cpu_usage * 100.0,
                    state_metrics.memory_usage,
                    progress,
                    state_cache.metrics.total_checks
                );
            }
            _ => {
                print!("{} | Runtime: \x1b[36m{:.1}s\x1b[0m | Transitions: \x1b[36m{}\x1b[0m", 
                    status_text,
                    state_cache.total_duration().as_secs_f64(),
                    state_cache.metrics.total_checks
                );
            }
        }
    } else {
        print!("{}", status_text);
    }

    // Print common metrics
    print!(" | Elapsed: \x1b[36m{:.1}s\x1b[0m", elapsed.as_secs_f64());
    
    // Flush output
    std::io::stdout().flush().ok();
}

/// Enhanced client configuration trait for safe cloning and configuration management
pub trait EnhancedClientConfig {
    fn get_endpoint(&self) -> String;
    fn get_api_key(&self) -> String;
    fn get_timeout_secs(&self) -> u64;
    fn is_mock(&self) -> bool;
    fn clone_client(&self) -> HeliusClient;
}

/// Enhanced client configuration with Redis caching
#[derive(Debug, Clone)]
pub struct EnhancedHeliusConfig {
    pub endpoint: String,
    pub api_key: String,
    pub timeout_secs: u64,
    pub use_mock: bool,
    pub redis_client: RedisClient,
    pub request_count_key: String,
}

impl EnhancedHeliusConfig {
    pub fn new() -> Result<Self> {
        let api_key = env::var("HELIUS_API_KEY")
            .context("HELIUS_API_KEY environment variable not set")?;

        let redis_url = format!("redis://{}:{}", REDIS_HOST, REDIS_PORT);
        let redis_client = RedisClient::open(redis_url)
            .context("Failed to create Redis client")?;

        Ok(Self {
            endpoint: "https://api.helius.xyz".to_string(),
            api_key,
            timeout_secs: 60,
            use_mock: false,
            redis_client,
            request_count_key: "helius_daily_requests".to_string(),
        })
    }

    /// Check if we've exceeded our daily API limit
    pub fn check_rate_limit(&self) -> Result<bool> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        let count: Option<u32> = conn.get(&self.request_count_key)
            .unwrap_or(Some(0));

        Ok(count.unwrap_or(0) < MAX_DAILY_REQUESTS)
    }

    /// Increment the daily request counter
    pub fn increment_request_count(&self) -> Result<()> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        // Increment counter and set TTL to expire at midnight UTC
        let _: () = redis::pipe()
            .atomic()
            .incr(&self.request_count_key, 1)
            .expire(&self.request_count_key, get_seconds_until_midnight())
            .query(&mut conn)
            .context("Failed to increment request counter")?;

        Ok(())
    }

    /// Warm up cache for a batch of program IDs
    pub async fn warm_cache(&self, program_ids: &[Pubkey], client: &HeliusClient) -> Result<()> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        for chunk in program_ids.chunks(CACHE_WARM_BATCH_SIZE) {
            let mut pipe = redis::pipe();
            pipe.atomic();

            for program_id in chunk {
                let cache_key = format!("request_status:{}", program_id);
                
                // Check if recently cached using proper HGET
                let cached_time: Option<i64> = conn.hget(&cache_key, "last_update")
                    .context("Failed to get cached timestamp")?;
                
                if let Some(cached_time) = cached_time {
                    let age = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() as i64 - cached_time;
                    
                    if age < CACHE_WARM_INTERVAL_SECS as i64 {
                        continue;
                    }
                }

                // Fetch and cache status
                if let Ok(status) = client.get_request_status(program_id).await {
                    let now = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_secs();

                    pipe.hset(&cache_key, "status", serde_json::to_string(&status)?);
                    pipe.hset(&cache_key, "last_update", now as i64);
                    pipe.expire(&cache_key, CACHE_TTL_SECS as usize);
                }
            }

            pipe.query(&mut conn)
                .context("Failed to execute cache warming pipeline")?;
        }

        Ok(())
    }

    /// Invalidate stale cache entries
    pub fn invalidate_stale_cache(&self) -> Result<usize> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        let mut invalidated = 0;
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Scan for all cache keys
        let mut cursor = 0;
        loop {
            let (next_cursor, keys): (i64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(CACHE_INVALIDATION_PATTERN)
                .query(&mut conn)
                .context("Failed to scan cache keys")?;

            for key in keys {
                if let Ok(cached_time) = conn.hget::<_, i64>(&key, "last_update") {
                    if now - cached_time > CACHE_STALE_THRESHOLD_SECS as i64 {
                        conn.del::<_, ()>(&key).context("Failed to delete stale cache entry")?;
                        invalidated += 1;
                    }
                }
            }

            cursor = next_cursor;
            if cursor == 0 {
                break;
            }
        }

        Ok(invalidated)
    }

    /// Get cache statistics
    pub fn get_cache_stats(&self) -> Result<CacheStats> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        let mut stats = CacheStats::default();
        let mut cursor = 0;

        loop {
            let (next_cursor, keys): (i64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(CACHE_INVALIDATION_PATTERN)
                .query(&mut conn)
                .context("Failed to scan cache keys")?;

            for key in keys {
                stats.total_entries += 1;
                if let Ok(cached_time) = conn.hget::<_, i64>(&key, "last_update") {
                    let age = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() as i64 - cached_time;
                    
                    if age > CACHE_STALE_THRESHOLD_SECS as i64 {
                        stats.stale_entries += 1;
                    }
                }
            }

            cursor = next_cursor;
            if cursor == 0 {
                break;
            }
        }

        Ok(stats)
    }
}

/// Cache statistics for monitoring
#[derive(Debug, Default)]
pub struct CacheStats {
    pub total_entries: usize,
    pub stale_entries: usize,
}

impl CacheStats {
    pub fn get_summary(&self) -> String {
        let stale_percentage = if self.total_entries > 0 {
            (self.stale_entries as f64 / self.total_entries as f64) * 100.0
        } else {
            0.0
        };

        format!(
            "Cache Stats:\n  ├─ Total Entries: {}\n  ├─ Stale Entries: {}\n  └─ Stale Percentage: {:.1}%",
            self.total_entries,
            self.stale_entries,
            stale_percentage
        )
    }
}

/// Get cached request status or fetch from Helius
async fn get_cached_request_status(
    client: &HeliusClient,
    config: &EnhancedHeliusConfig,
    program_id: &Pubkey,
) -> Result<CoreChaosRequestStatus> {
    let cache_key = format!("request_status:{}", program_id);
    let mut conn = config.redis_client.get_connection()
        .context("Failed to connect to Redis")?;

    // Try to get from cache first
    if let Ok(cached_status) = conn.get::<_, String>(&cache_key) {
        return Ok(serde_json::from_str(&cached_status)
            .context("Failed to deserialize cached status")?);
    }

    // Check rate limit before making API call
    if !config.check_rate_limit()? {
        return Err(anyhow::anyhow!("Daily Helius API limit exceeded"));
    }

    // Fetch from Helius
    let status = client.get_request_status(program_id).await?;
    config.increment_request_count()?;

    // Cache the result
    let _: () = conn.set_ex(
        &cache_key,
        serde_json::to_string(&status)?,
        CACHE_TTL_SECS as usize,
    ).context("Failed to cache request status")?;

    Ok(status)
}

/// Get seconds until midnight UTC for Redis TTL
fn get_seconds_until_midnight() -> usize {
    let now = OffsetDateTime::now_utc();
    let tomorrow = (now + time::Duration::days(1))
        .replace_time(Time::MIDNIGHT);
    let duration = tomorrow - now;
    duration.whole_seconds().max(0) as usize
}

// Update the EnhancedClientConfig implementation
impl EnhancedClientConfig for HeliusClient {
    fn get_endpoint(&self) -> String {
        env::var("HELIUS_ENDPOINT")
            .unwrap_or_else(|_| "https://api.helius.xyz".to_string())
    }

    fn get_api_key(&self) -> String {
        env::var("HELIUS_API_KEY")
            .expect("HELIUS_API_KEY environment variable not set")
    }

    fn get_timeout_secs(&self) -> u64 {
        env::var("HELIUS_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60)
    }

    fn is_mock(&self) -> bool {
        env::var("HELIUS_USE_MOCK")
            .map(|v| v == "true")
            .unwrap_or(false)
    }

    fn clone_client(&self) -> HeliusClient {
        HeliusClient::with_config(HeliusConfig {
            endpoint: self.get_endpoint(),
            api_key: self.get_api_key(),
            timeout_secs: self.get_timeout_secs(),
            use_mock: self.is_mock(),
        })
    }
}

/// Monitors a chaos request until completion or timeout with enhanced status tracking
async fn monitor_request(
    client: &mut HeliusClient,
    tracker: &mut RequestTracker,
    timeout_secs: u64,
) -> Result<()> {
    let timeout = Duration::from_secs(timeout_secs);
    let start = Instant::now();
    let poll_interval = tracker.network_config.test_mode.get_poll_interval();
    let mut error_tracker = RetryErrorTracker::new();
    let mut state_cache = StateCache::new();
    let mut current_status = EnhancedRequestStatus::new(CoreChaosRequestStatus::Pending);
    let mut security_metrics = SecurityMetrics::new();

    // Initialize enhanced Helius configuration with Redis
    let enhanced_config = EnhancedHeliusConfig::new()
        .context("Failed to initialize enhanced Helius configuration")?;

    // Create compact format for progress updates
    let format = StatusFormat {
        use_color: true,
        show_metrics: true,
        compact: true,
        max_width: 120,
        show_timestamps: true,
    };

    println!("\n🔍 Starting monitoring for request {} on {}", 
        tracker.request_id,
        tracker.network_config.cluster.name()
    );

    // Create a cloned client for async operations
    let client_arc = Arc::new(Mutex::new(client.clone_client()));

    while start.elapsed() < timeout {
        let program_id = tracker.program_id;
        let request_id = tracker.request_id.clone();
        let retry_config = tracker.network_config.retry_config.clone();
        let enhanced_config = enhanced_config.clone();

        // Create operation factory with Redis caching
        let make_operation = {
            let client = Arc::clone(&client_arc);
            let request_id = request_id.clone();
            let program_id = program_id;

            move || {
                let client = Arc::clone(&client);
                let request_id = request_id.clone();
                let enhanced_config = enhanced_config.clone();

                async move {
                    let start = Instant::now();
                    let result = {
                        let client_guard = client.lock().map_err(|e| {
                            anyhow::anyhow!("Failed to acquire client lock: {} (request: {})", e, request_id)
                        })?;

                        // Enhanced security validation
                        if let Err(security_error) = security_metrics.validate_request(&program_id, SystemTime::now()) {
                            println!("\n⚠️  Security validation failed:");
                            println!("   └─ {}", security_error);
                            return Err(anyhow::anyhow!("Security validation failed: {}", security_error));
                        }

                        // Use cached request status with rate limiting
                        get_cached_request_status(&client_guard, &enhanced_config, &program_id).await
                            .with_context(|| format!(
                                "Failed to get status for request {} (program: {}, elapsed: {:.2}s)", 
                                request_id, program_id, start.elapsed().as_secs_f64()
                            ))
                    };

                    // Enhanced performance monitoring
                    let duration = start.elapsed();
                    if duration > Duration::from_millis(500) {
                        println!("\n⚠️  Performance warning:");
                        println!("   ├─ Slow request detected for {}", request_id);
                        println!("   ├─ Duration: {:.2}s", duration.as_secs_f64());
                        println!("   └─ Program: {}", program_id);
                    }

                    result
                }
            }
        };

        let new_core_status = match retry_with_backoff(make_operation, &retry_config).await {
            Ok(status) => status,
            Err(e) => {
                error_tracker.add_error(&e);
                let error_context = format!(
                    "Request failed after {} retries\nTotal duration: {:.2}s\nError history:\n{}",
                    retry_config.max_retries,
                    start.elapsed().as_secs_f64(),
                    error_tracker.get_error_summary()
                );
                return Err(anyhow::anyhow!("{}\nContext: {}", e, error_context));
            }
        };

        // Validate state transition with enhanced security
        if !current_status.validate_transition(&new_core_status) {
            println!("⚠️  Invalid state transition detected");
            println!("   ├─ From: {:?}", current_status.inner());
            println!("   ├─ To: {:?}", new_core_status);
            println!("   └─ Security metrics: {}", security_metrics.get_summary());
            tokio::time::sleep(poll_interval).await;
            continue;
        }

        // Update current status with security tracking
        current_status.record_transition(new_core_status.clone());

        // Update state cache and tracker with enhanced metrics
        let current_metrics = tracker.get_current_state_metrics();
        state_cache.update(
            current_status.clone(),
            current_metrics.memory_usage,
            current_metrics.cpu_usage
        );

        tracker.update_status(new_core_status.clone());

        // Enhanced status display with security context
        print_enhanced_status(
            tracker,
            current_status.inner(),
            &state_cache,
            &format,
            start.elapsed()
        );

        // Check for terminal states with enhanced reporting
        if current_status.is_terminal() {
            println!("\nRequest completed with {} state transitions", current_status.transition_count());
            if let Some(age) = current_status.last_transition_age() {
                println!("Last transition was {:.2}s ago", age.as_secs_f64());
            }
            println!("\nSecurity Summary:");
            println!("{}", security_metrics.get_detailed_report());
            tracker.print_progress();
            println!("\n{}", state_cache.get_metrics_summary());
            return Ok(());
        }

        tokio::time::sleep(poll_interval).await;
    }

    // Handle timeout with enhanced error reporting
    println!("\n\x1b[33m⚠️  Monitoring timed out after {}s\x1b[0m", timeout_secs);
    println!("\nFinal Security Report:");
    println!("{}", security_metrics.get_detailed_report());
    
    let timeout_status = CoreChaosRequestStatus::TimedOut;
    tracker.update_status(timeout_status.clone());
    
    state_cache.update(
        EnhancedRequestStatus::new(timeout_status),
        tracker.get_current_state_metrics().memory_usage,
        tracker.get_current_state_metrics().cpu_usage
    );
    
    tracker.print_progress();
    println!("\n{}", state_cache.get_metrics_summary());

    if error_tracker.total_errors > 0 {
        println!("\n⚠️  Error Statistics:");
        print!("{}", error_tracker.get_error_summary());
    }

    Ok(())
}

/// Metrics for tracking state transitions and performance
#[derive(Debug, Clone)]
pub struct StateMetrics {
    /// Number of status checks in current state
    pub checks_in_state: usize,
    /// Current memory usage in KB
    pub memory_usage: u64,
    /// Current CPU usage percentage (0.0-1.0)
    pub cpu_usage: f64,
    /// Count of errors in current state
    pub error_count: usize,
    /// When this state began
    pub start_time: Instant,
    /// Last time metrics were updated
    pub last_update: Instant,
    /// History of status changes with timestamps
    pub status_history: Vec<(CoreChaosRequestStatus, Instant)>,
    // Enhanced metrics
    pub peak_memory_usage: u64,
    pub peak_cpu_usage: f64,
    pub avg_check_duration: Duration,
    pub total_check_duration: Duration,
    pub check_count: usize,
}

impl Default for StateMetrics {
    fn default() -> Self {
        let now = Instant::now();
        Self {
            checks_in_state: 0,
            memory_usage: 0,
            cpu_usage: 0.0,
            error_count: 0,
            start_time: now,
            last_update: now,
            status_history: Vec::new(),
            peak_memory_usage: 0,
            peak_cpu_usage: 0.0,
            avg_check_duration: Duration::from_secs(0),
            total_check_duration: Duration::from_secs(0),
            check_count: 0,
        }
    }
}

/// Metrics for monitoring state transitions
#[derive(Debug, Clone)]
pub struct TransitionMetrics {
    /// Total number of transitions
    pub total_transitions: usize,
    /// Age of the request
    pub age: Duration,
    /// Time since last transition
    pub last_transition_age: Option<Duration>,
    /// Current state
    pub current_state: CoreChaosRequestStatus,
    /// Whether current state is terminal
    pub is_terminal: bool,
}

/// Enhanced state caching with performance metrics
#[derive(Debug, Clone)]
pub struct StateCache {
    /// Tracks all state transitions with timestamps
    pub state_transitions: Vec<(CoreChaosRequestStatus, Instant)>,
    /// Performance metrics for the request
    pub metrics: StateCacheMetrics,
    /// Last known state
    pub last_state: Option<CoreChaosRequestStatus>,
    /// Cache creation time
    pub created_at: Instant,
    /// Security context for state transition validation
    pub security_context: SecurityContext,
}

/// Detailed metrics for state cache monitoring
#[derive(Debug, Clone)]
pub struct StateCacheMetrics {
    /// Total number of state checks performed
    pub total_checks: usize,
    /// Number of state transitions
    pub transition_count: usize,
    /// Average time between state changes
    pub avg_transition_time: Duration,
    /// Peak memory usage observed
    pub peak_memory_kb: u64,
    /// Peak CPU usage observed
    pub peak_cpu_percent: f64,
    /// Error counts by type
    pub error_counts: HashMap<String, usize>,
}

/// Security context for state transition validation
#[derive(Debug, Clone)]
pub struct SecurityContext {
    /// Maximum transitions allowed per time window
    pub max_transitions: usize,
    /// Time window for rate limiting in seconds
    pub time_window: u64,
    /// Count of transitions in current window
    pub transition_count: usize,
    /// Start of current time window
    pub window_start: Instant,
    /// Last transition timestamp
    pub last_transition: Option<Instant>,
}

/// Enhanced error tracking for retry operations
#[derive(Debug, Default)]
pub struct RetryErrorTracker {
    pub total_errors: usize,
    pub error_history: Vec<(Instant, String)>,
    pub error_types: HashMap<String, usize>,
}

/// Security metrics for monitoring system-wide state transitions
#[derive(Debug, Default)]
pub struct SecurityMetrics {
    /// Set of seen program IDs for detecting replay attacks
    pub seen_programs: HashSet<Pubkey>,
    /// Timestamp of last security event
    pub last_security_event: Option<SystemTime>,
    /// Count of security violations
    pub violation_count: usize,
    /// Types of violations observed
    pub violation_types: HashMap<String, usize>,
}

impl SecurityMetrics {
    pub fn new() -> Self {
        Self {
            seen_programs: HashSet::new(),
            last_security_event: None,
            violation_count: 0,
            violation_types: HashMap::new(),
        }
    }

    pub fn record_violation(&mut self, violation_type: &str) {
        self.violation_count += 1;
        *self.violation_types.entry(violation_type.to_string()).or_insert(0) += 1;
        self.last_security_event = Some(SystemTime::now());
    }

    pub fn validate_request(&self, program_id: &Pubkey, current_time: SystemTime) -> Result<()> {
        // Check if program has been seen before
        if !self.seen_programs.contains(program_id) {
            return Ok(());
        }

        // Check for suspicious rapid requests
        if let Some(last_event) = self.last_security_event {
            let duration = current_time.duration_since(last_event)
                .context("Invalid time comparison")?;
            
            if duration.as_secs() < SECURITY_TIME_WINDOW_SECS {
                return Err(anyhow::anyhow!("Request rate exceeds security threshold"));
            }
        }

        Ok(())
    }

    pub fn get_summary(&self) -> String {
        let mut summary = String::new();
        summary.push_str(&format!("Security Metrics Summary:\n"));
        summary.push_str(&format!("├─ Total Programs: {}\n", self.seen_programs.len()));
        summary.push_str(&format!("├─ Violation Count: {}\n", self.violation_count));
        
        if let Some(last_event) = self.last_security_event {
            if let Ok(age) = SystemTime::now().duration_since(last_event) {
                summary.push_str(&format!("└─ Last Event: {}s ago\n", age.as_secs()));
            }
        }
        
        summary
    }

    pub fn get_detailed_report(&self) -> String {
        let mut report = String::new();
        report.push_str(&format!("Security Report:\n"));
        report.push_str(&format!("├─ Total Violations: {}\n", self.violation_count));
        report.push_str(&format!("├─ Unique Programs: {}\n", self.seen_programs.len()));
        
        if let Some(last_event) = self.last_security_event {
            let age = SystemTime::now()
                .duration_since(last_event)
                .unwrap_or_default();
            report.push_str(&format!("├─ Last Event: {}s ago\n", age.as_secs()));
        }

        report.push_str("└─ Violation Types:\n");
        for (violation_type, count) in &self.violation_types {
            let percentage = (*count as f64 / self.violation_count as f64) * 100.0;
            report.push_str(&format!("   └─ {}: {} ({:.1}%)\n", violation_type, count, percentage));
        }

        report
    }
}

impl Default for StateCacheMetrics {
    fn default() -> Self {
        Self {
            total_checks: 0,
            transition_count: 0,
            avg_transition_time: Duration::from_secs(0),
            peak_memory_kb: 0,
            peak_cpu_percent: 0.0,
            error_counts: HashMap::new(),
        }
    }
}

// Add atomic counter for global transitions
static GLOBAL_TRANSITION_COUNT: AtomicUsize = AtomicUsize::new(0);

impl StateCache {
    pub fn new() -> Self {
        Self {
            state_transitions: Vec::new(),
            metrics: StateCacheMetrics::default(),
            last_state: None,
            created_at: Instant::now(),
            security_context: SecurityContext::new(100, 60), // 100 transitions per minute
        }
    }

    pub fn update(&mut self, status: EnhancedRequestStatus, memory_kb: u64, cpu_percent: f64) {
        let now = Instant::now();
        self.metrics.total_checks += 1;
        
        // Update metrics
        self.metrics.peak_memory_kb = self.metrics.peak_memory_kb.max(memory_kb);
        self.metrics.peak_cpu_percent = self.metrics.peak_cpu_percent.max(cpu_percent);

        // Track state transition if state changed
        if self.last_state.as_ref() != Some(status.inner()) {
            self.state_transitions.push((status.inner().clone(), now));
            self.metrics.transition_count += 1;
            
            if self.state_transitions.len() > 1 {
                let last_transition = self.state_transitions[self.state_transitions.len() - 2].1;
                let transition_time = now.duration_since(last_transition);
                self.metrics.avg_transition_time = Duration::from_secs_f64(
                    (self.metrics.avg_transition_time.as_secs_f64() * (self.metrics.transition_count - 1) as f64
                    + transition_time.as_secs_f64()) / self.metrics.transition_count as f64
                );
            }
        }

        if matches!(status.inner(), CoreChaosRequestStatus::Failed) {
            *self.metrics.error_counts.entry("Failed".to_string()).or_insert(0) += 1;
        }

        self.last_state = Some(status.inner().clone());
    }

    pub fn total_duration(&self) -> Duration {
        Instant::now().duration_since(self.created_at)
    }

    pub fn get_metrics_summary(&self) -> String {
        let mut summary = String::new();
        summary.push_str(&format!("📊 Cache Metrics:\n"));
        summary.push_str(&format!("   ├─ Total Checks: {}\n", self.metrics.total_checks));
        summary.push_str(&format!("   ├─ State Transitions: {}\n", self.metrics.transition_count));
        summary.push_str(&format!("   ├─ Avg Transition Time: {:.2}s\n", self.metrics.avg_transition_time.as_secs_f64()));
        summary.push_str(&format!("   ├─ Peak Memory: {} KB\n", self.metrics.peak_memory_kb));
        summary.push_str(&format!("   ├─ Peak CPU: {:.1}%\n", self.metrics.peak_cpu_percent));
        
        if !self.metrics.error_counts.is_empty() {
            summary.push_str("   └─ Error Distribution:\n");
            for (error_type, count) in &self.metrics.error_counts {
                summary.push_str(&format!("      └─ {}: {}\n", error_type, count));
            }
        }
        
        summary
    }
}

impl SecurityContext {
    pub fn new(max_transitions: usize, time_window: u64) -> Self {
        Self {
            max_transitions,
            time_window,
            transition_count: 0,
            window_start: Instant::now(),
            last_transition: None,
        }
    }

    pub fn can_transition(&mut self) -> bool {
        let now = Instant::now();
        
        // Check if we need to reset the window
        if now.duration_since(self.window_start).as_secs() >= self.time_window {
            self.window_start = now;
            self.transition_count = 0;
        }

        // Check rate limiting
        if self.transition_count >= self.max_transitions {
            return false;
        }

        // Update state
        self.transition_count += 1;
        self.last_transition = Some(now);
        true
    }
}

impl RetryErrorTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_error(&mut self, error: &anyhow::Error) {
        self.total_errors += 1;
        self.error_history.push((Instant::now(), error.to_string()));
        
        // Categorize error
        let error_type = if error.to_string().contains("timeout") {
            "Timeout"
        } else if error.to_string().contains("rate limit") {
            "RateLimit"
        } else {
            "Unknown"
        };
        
        *self.error_types.entry(error_type.to_string()).or_insert(0) += 1;
    }

    pub fn get_error_summary(&self) -> String {
        let mut summary = String::new();
        if self.total_errors > 0 {
            summary.push_str(&format!("Total Errors: {}\n", self.total_errors));
            summary.push_str("Error Types:\n");
            for (error_type, count) in &self.error_types {
                let percentage = (count * 100) / self.total_errors;
                summary.push_str(&format!("  {}: {} ({}%)\n", error_type, count, percentage));
            }
        }
        summary
    }
}

impl RequestTracker {
    pub fn new(request_id: String, program_id: Pubkey, network_config: NetworkConfig) -> Self {
        let now = Instant::now();
        Self {
            request_id,
            program_id,
            start_time: now,
            last_status: CoreChaosRequestStatus::Pending,
            status_changes: vec![(CoreChaosRequestStatus::Pending, now, StateMetrics::default())],
            metrics: RequestMetrics::default(),
            network_config,
        }
    }

    pub fn get_metrics(&self) -> &RequestMetrics {
        &self.metrics
    }

    pub fn get_current_state_metrics(&self) -> &StateMetrics {
        &self.status_changes.last().unwrap().2
    }

    pub fn update_status(&mut self, new_status: CoreChaosRequestStatus) {
        let now = Instant::now();
        
        // Update metrics
        self.metrics.status_check_count += 1;
        if let Some(last_check) = self.metrics.last_check_time {
            let duration = now.duration_since(last_check);
            match self.last_status {
                CoreChaosRequestStatus::Pending => self.metrics.total_pending_time += duration,
                CoreChaosRequestStatus::InProgress => self.metrics.total_in_progress_time += duration,
                _ => {}
            }
        }
        self.metrics.last_check_time = Some(now);

        // Create state metrics
        let state_metrics = StateMetrics {
            checks_in_state: self.metrics.status_check_count,
            memory_usage: 1000 + (self.metrics.status_check_count as u64 * 100),
            cpu_usage: 0.1 + (self.metrics.status_check_count as f64 * 0.01).min(0.9),
            error_count: if matches!(new_status, CoreChaosRequestStatus::Failed) { 1 } else { 0 },
            start_time: self.start_time,
            last_update: now,
            status_history: vec![(new_status.clone(), now)],
            // Initialize enhanced metrics
            peak_memory_usage: 0,
            peak_cpu_usage: 0.0,
            avg_check_duration: Duration::from_secs(0),
            total_check_duration: Duration::from_secs(0),
            check_count: 0,
        };

        // Update status if changed
        if new_status != self.last_status {
            self.status_changes.push((new_status.clone(), now, state_metrics));
            self.last_status = new_status;
        }
    }

    pub fn print_progress(&self) {
        println!("\n📊 Request Progress for {}", self.request_id);
        println!("├─ Program: {}", self.program_id);
        println!("├─ Current Status: {:?}", self.last_status);
        println!("├─ Duration: {:.2}s", self.start_time.elapsed().as_secs_f64());
        println!("├─ Status Checks: {}", self.metrics.status_check_count);
        println!("├─ Time Pending: {:.2}s", self.metrics.total_pending_time.as_secs_f64());
        println!("└─ Time In Progress: {:.2}s", self.metrics.total_in_progress_time.as_secs_f64());
        
        // Print status history
        if !self.status_changes.is_empty() {
            println!("\nStatus History:");
            for (i, (status, time, metrics)) in self.status_changes.iter().enumerate() {
                let elapsed = time.duration_since(self.start_time);
                println!("{}─ [{:>5.2}s] {:?}", 
                    if i == self.status_changes.len() - 1 { "└" } else { "├" },
                    elapsed.as_secs_f64(),
                    status
                );
                println!("   ├─ Checks: {}", metrics.checks_in_state);
                println!("   ├─ Memory: {} KB", metrics.memory_usage);
                println!("   └─ CPU: {:.1}%", metrics.cpu_usage * 100.0);
            }
        }
    }
}

/// Async retry mechanism with exponential backoff
pub async fn retry_with_backoff<T, F, Fut>(
    operation: F,
    config: &RetryConfig,
) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut delay = config.base_delay_ms;
    let mut attempt = 0;
    let mut error_tracker = RetryErrorTracker::new();

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                attempt += 1;
                error_tracker.add_error(&e);

                if attempt >= config.max_retries {
                    return Err(anyhow::anyhow!(
                        "Max retries ({}) exceeded. Error summary:\n{}",
                        config.max_retries,
                        error_tracker.get_error_summary()
                    ));
                }

                // Exponential backoff with jitter
                let jitter = rand::random::<u64>() % config.jitter_range_ms;
                delay = if config.use_exponential {
                    ((delay * 2) + jitter).min(config.max_delay_ms)
                } else {
                    (delay + jitter).min(config.max_delay_ms)
                };

                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }
        }
    }
}

/// Enhanced rate limiting with priority support
#[derive(Debug)]
pub struct RateLimiter {
    redis_client: RedisClient,
    window_size: u64,
    max_requests: u32,
    burst_allowance: u32,
}

impl RateLimiter {
    pub fn new(redis_client: RedisClient) -> Self {
        Self {
            redis_client,
            window_size: RATE_LIMIT_WINDOW_SECS,
            max_requests: MAX_DAILY_REQUESTS,
            burst_allowance: BURST_ALLOWANCE,
        }
    }

    /// Check if request is allowed with priority support
    pub async fn check_rate_limit(&self, program_id: &Pubkey, priority: RequestPriority) -> Result<bool> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;
        
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let window_key = format!("rate_limit:{}:{}", program_id, now / self.window_size);
        let count: Option<u32> = conn.get(&window_key)?;

        let current_count = count.unwrap_or(0);
        let adjusted_max = match priority {
            RequestPriority::High => (self.max_requests as f64 * HIGH_PRIORITY_MULTIPLIER) as u32,
            RequestPriority::Normal => self.max_requests,
            RequestPriority::Low => self.max_requests / 2,
        };

        // Allow burst if within allowance
        let burst_key = format!("burst:{}:{}", program_id, now / (self.window_size * 24));
        let burst_count: Option<u32> = conn.get(&burst_key)?;
        let can_burst = burst_count.unwrap_or(0) < self.burst_allowance;

        Ok(current_count < adjusted_max || can_burst)
    }

    /// Record a request with sliding window
    pub async fn record_request(&self, program_id: &Pubkey) -> Result<()> {
        let mut conn = self.redis_client.get_connection()
            .map_err(|e| anyhow::anyhow!("Redis connection error: {}", e))?;

        let key = format!("rate_limit:{}", program_id);
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let mut pipe = redis::pipe();
        pipe.atomic()
            .zadd(&key, now.to_string(), now)
            .zremrangebyscore(&key, "-inf", (now - self.window_size).to_string())
            .expire(&key, self.window_size as usize);

        let _: () = pipe.query(&mut conn)
            .map_err(|e| anyhow::anyhow!("Redis query error: {}", e))?;

        Ok(())
    }

    /// Get current rate limit status
    pub async fn get_rate_limit_status(&self, program_id: &Pubkey) -> Result<RateLimitStatus> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let window_key = format!("rate_limit:{}:{}", program_id, now / self.window_size);
        let burst_key = format!("burst:{}:{}", program_id, now / (self.window_size * 24));

        let current_count: u32 = conn.get(&window_key).unwrap_or(0);
        let burst_count: u32 = conn.get(&burst_key).unwrap_or(0);

        Ok(RateLimitStatus {
            current_count,
            burst_count,
            window_remaining: self.window_size - (now % self.window_size),
            max_requests: self.max_requests,
            burst_allowance: self.burst_allowance,
        })
    }

    pub async fn record_error(&self, program_id: &Pubkey, error: &anyhow::Error) -> Result<CircuitStatus> {
        let mut conn = self.redis_client.get_connection()
            .map_err(|e| anyhow::anyhow!("Redis connection error: {}", e))?;

        let key = format!("errors:{}", program_id);
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let mut pipe = redis::pipe();
        pipe.atomic()
            .zadd(&key, error.to_string(), now)
            .zremrangebyscore(&key, "-inf", (now - self.reset_interval).to_string())
            .expire(&key, self.reset_interval as usize);

        let _: () = pipe.query(&mut conn)
            .map_err(|e| anyhow::anyhow!("Redis query error: {}", e))?;

        let error_count: usize = conn.zcard(&key)
            .map_err(|e| anyhow::anyhow!("Redis ZCARD error: {}", e))?;

        if error_count >= self.error_threshold {
            Ok(CircuitStatus::Open)
        } else if error_count == self.error_threshold - 1 {
            Ok(CircuitStatus::JustOpened)
        } else {
            Ok(CircuitStatus::Closed)
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum RequestPriority {
    High,
    Normal,
    Low,
}

#[derive(Debug)]
pub struct RateLimitStatus {
    pub current_count: u32,
    pub burst_count: u32,
    pub window_remaining: u64,
    pub max_requests: u32,
    pub burst_allowance: u32,
}

impl RateLimitStatus {
    pub fn get_summary(&self) -> String {
        format!(
            "Rate Limit Status:\n  ├─ Current Count: {}/{}\n  ├─ Burst Count: {}/{}\n  ├─ Window Remaining: {}s\n  └─ Usage: {:.1}%",
            self.current_count,
            self.max_requests,
            self.burst_count,
            self.burst_allowance,
            self.window_remaining,
            (self.current_count as f64 / self.max_requests as f64) * 100.0
        )
    }
}

/// Enhanced error recovery with circuit breaker pattern
#[derive(Debug)]
pub struct ErrorRecovery {
    redis_client: RedisClient,
    error_threshold: usize,
    reset_interval: u64,
}

impl ErrorRecovery {
    pub fn new(redis_client: RedisClient) -> Self {
        Self {
            redis_client,
            error_threshold: CIRCUIT_BREAKER_THRESHOLD,
            reset_interval: CIRCUIT_BREAKER_RESET_SECS,
        }
    }

    pub async fn record_error(&self, program_id: &Pubkey, error: &anyhow::Error) -> Result<CircuitStatus> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let error_key = format!("errors:{}", program_id);
        let circuit_key = format!("circuit:{}", program_id);

        // Check if circuit is already open
        let is_open: bool = conn.exists(&circuit_key)
            .context("Failed to check circuit status")?;
            
        if is_open {
            return Ok(CircuitStatus::Open);
        }

        // Add error to history with timestamp
        let error_entry = ErrorEntry {
            timestamp: now,
            error: error.to_string(),
            error_type: categorize_error(error),
            program_id: Some(*program_id),
            request_id: None,
            recovery_attempts: 0,
        };

        let json = serde_json::to_string(&error_entry)
            .context("Failed to serialize error entry")?;

        // Use pipeline for atomic operations
        redis::pipe()
            .atomic()
            .lpush(&error_key, json)
            .ltrim(&error_key, 0, MAX_ERROR_HISTORY as isize - 1)
            .expire(&error_key, (self.reset_interval * 2) as usize)
            .query(&mut conn)
            .context("Failed to record error")?;

        // Get recent errors for analysis
        let recent_errors: Vec<String> = conn.lrange(&error_key, 0, self.error_threshold as isize - 1)
            .context("Failed to get recent errors")?;

        let error_count = recent_errors.len();
        
        if error_count >= self.error_threshold {
            // Open circuit breaker
            conn.set_ex(&circuit_key, "open", self.reset_interval as usize)
                .context("Failed to open circuit breaker")?;
            
            Ok(CircuitStatus::JustOpened)
        } else {
            Ok(CircuitStatus::Closed)
        }
    }

    pub async fn attempt_recovery(&self, program_id: &Pubkey) -> Result<RecoveryAction> {
        let mut conn = self.redis_client.get_connection()
            .context("Failed to connect to Redis")?;

        let error_key = format!("errors:{}", program_id);
        
        // Get recent errors for analysis
        let recent_errors: Vec<String> = conn.lrange(&error_key, 0, MAX_ERROR_HISTORY as isize - 1)
            .context("Failed to get recent errors")?;

        let mut error_types = HashMap::new();
        let mut total_errors = 0;

        // Analyze error patterns
        for error_json in recent_errors {
            if let Ok(error_entry) = serde_json::from_str::<ErrorEntry>(&error_json) {
                *error_types.entry(error_entry.error_type).or_insert(0) += 1;
                total_errors += 1;
            }
        }

        // Determine dominant error type
        let mut dominant_type = None;
        let mut max_count = 0;

        for (error_type, count) in error_types {
            if count > max_count {
                max_count = count;
                dominant_type = Some(error_type);
            }
        }

        // Choose recovery action based on error pattern
        let action = match dominant_type {
            Some(ErrorType::RateLimit) => RecoveryAction::BackOff {
                duration: 60_000, // 60 seconds
                reason: "Rate limit errors dominant".to_string(),
            },
            Some(ErrorType::Timeout) => RecoveryAction::Retry {
                max_attempts: 3,
                reason: "Timeout errors dominant".to_string(),
            },
            Some(ErrorType::Network) => RecoveryAction::SwitchEndpoint {
                reason: "Network errors dominant".to_string(),
            },
            _ => RecoveryAction::Alert {
                message: format!("Unknown error pattern detected ({} errors)", total_errors),
            },
        };

        Ok(action)
    }
}

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorType {
    RateLimit,
    Timeout,
    Network,
    Authorization,
    Unknown,
}

#[derive(Debug)]
pub enum CircuitStatus {
    Open,
    Closed,
    JustOpened,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    BackOff {
        duration: u64,  // Store duration as u64 milliseconds for serialization
        reason: String,
    },
    Retry {
        max_attempts: u32,
        reason: String,
    },
    SwitchEndpoint {
        reason: String,
    },
    Alert {
        message: String,
    },
}

impl ErrorAnalysis {
    fn get_error_percentage(&self, error_type: ErrorType) -> f64 {
        if self.total_errors == 0 {
            return 0.0;
        }

        let error_count = self.error_types.get(&error_type).copied().unwrap_or(0);
        (error_count as f64 / self.total_errors as f64) * 100.0
    }

    fn is_error_type_dominant(&self, error_type: ErrorType, threshold: f64) -> bool {
        self.get_error_percentage(error_type) >= threshold
    }

    fn is_rate_limit_dominant(&self) -> bool {
        self.is_error_type_dominant(ErrorType::RateLimit, 50.0)
    }

    fn is_timeout_dominant(&self) -> bool {
        self.is_error_type_dominant(ErrorType::Timeout, 50.0)
    }

    fn is_network_dominant(&self) -> bool {
        self.is_error_type_dominant(ErrorType::Network, 50.0)
    }

    /// Get detailed error analysis with trends
    pub fn get_detailed_analysis(&self) -> String {
        let mut analysis = format!("Error Analysis (Total: {}):\n", self.total_errors);
        
        // Error type distribution
        analysis.push_str("Error Distribution:\n");
        for (error_type, count) in &self.error_types {
            let percentage = self.get_error_percentage(error_type.clone());
            analysis.push_str(&format!("  ├─ {:?}: {} ({:.1}%)\n", error_type, count, percentage));
        }

        // Timeline analysis
        if !self.error_timeline.is_empty() {
            let last_error = self.error_timeline[0].0;
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            
            analysis.push_str(&format!("\nTimeline Analysis:\n"));
            analysis.push_str(&format!("  ├─ Last Error: {}s ago\n", now - last_error));
            analysis.push_str(&format!("  ├─ Peak Error Rate: {:.2} errors/sec\n", self.peak_error_rate));
            analysis.push_str(&format!("  └─ Avg Recovery Time: {:.2}s\n", self.avg_recovery_time.as_secs_f64()));
        }

        // Program impact analysis
        if !self.most_affected_programs.is_empty() {
            analysis.push_str("\nMost Affected Programs:\n");
            let mut programs: Vec<_> = self.most_affected_programs.iter().collect();
            programs.sort_by(|a, b| b.1.cmp(a.1));
            
            for (program_id, error_count) in programs.iter().take(5) {
                let percentage = (*error_count as f64 / self.total_errors as f64) * 100.0;
                analysis.push_str(&format!("  └─ {}: {} errors ({:.1}%)\n", 
                    program_id, error_count, percentage));
            }
        }

        analysis
    }

    /// Get recommendations based on error patterns
    pub fn get_recommendations(&self) -> Vec<String> {
        let mut recommendations = Vec::new();

        if self.is_rate_limit_dominant() {
            recommendations.push("Consider implementing rate limiting with exponential backoff".to_string());
            recommendations.push("Review and optimize API usage patterns".to_string());
        }

        if self.is_timeout_dominant() {
            recommendations.push("Consider increasing timeout values".to_string());
            recommendations.push("Implement request chunking for large operations".to_string());
        }

        if self.is_network_dominant() {
            recommendations.push("Implement automatic endpoint failover".to_string());
            recommendations.push("Consider using a connection pool".to_string());
        }

        if self.peak_error_rate > 10.0 {
            recommendations.push("Implement circuit breaker pattern".to_string());
            recommendations.push("Add request throttling".to_string());
        }

        if self.avg_recovery_time > Duration::from_secs(30) {
            recommendations.push("Review and optimize recovery strategies".to_string());
            recommendations.push("Consider implementing parallel recovery attempts".to_string());
        }

        recommendations
    }
}

fn categorize_error(error: &anyhow::Error) -> ErrorType {
    let error_str = error.to_string().to_lowercase();
    
    if error_str.contains("rate limit") || error_str.contains("too many requests") {
        ErrorType::RateLimit
    } else if error_str.contains("timeout") || error_str.contains("deadline exceeded") {
        ErrorType::Timeout
    } else if error_str.contains("network") || error_str.contains("connection") {
        ErrorType::Network
    } else if error_str.contains("unauthorized") || error_str.contains("forbidden") {
        ErrorType::Authorization
    } else {
        ErrorType::Unknown
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("🚀 Starting Glitch Gremlin Basic Example");

    // Initialize network configuration
    let network_config = create_network_config(
        SolanaCluster::Devnet,
        TestMode::default_testnet(),
    );

    // Initialize Helius client with enhanced configuration
    let enhanced_config = EnhancedHeliusConfig::new()?;
    let mut client = HeliusClient::with_config(HeliusConfig {
        endpoint: enhanced_config.endpoint.clone(),
        api_key: enhanced_config.api_key.clone(),
        timeout_secs: enhanced_config.timeout_secs,
        use_mock: enhanced_config.use_mock,
    });

    // Create a test program ID
    let program_id = Pubkey::new_unique();
    let request_id = format!("test-{}", program_id);

    // Initialize request tracker
    let mut tracker = RequestTracker::new(
        request_id.clone(),
        program_id,
        network_config.clone(),
    );

    println!("\n📋 Test Configuration:");
    println!("├─ Network: {}", network_config.cluster.name());
    println!("├─ Mode: {}", network_config.test_mode.description());
    println!("├─ Program ID: {}", program_id);
    println!("└─ Request ID: {}", request_id);

    // Monitor the request
    match monitor_request(&mut client, &mut tracker, 60).await {
        Ok(()) => println!("\n✅ Request monitoring completed successfully"),
        Err(e) => println!("\n❌ Error monitoring request: {}", e),
    }

    Ok(())
}

// Add Default implementation for StateMetrics
impl Default for StateMetrics {
    fn default() -> Self {
        let now = Instant::now();
        Self {
            checks_in_state: 0,
            memory_usage: 0,
            cpu_usage: 0.0,
            error_count: 0,
            start_time: now,
            last_update: now,
            status_history: Vec::new(),
            peak_memory_usage: 0,
            peak_cpu_usage: 0.0,
            avg_check_duration: Duration::from_secs(0),
            total_check_duration: Duration::from_secs(0),
            check_count: 0,
        }
    }
}

// Add serde implementation for ChaosRequestStatus
impl Serialize for CoreChaosRequestStatus {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(match self {
            CoreChaosRequestStatus::Pending => "Pending",
            CoreChaosRequestStatus::InProgress => "InProgress",
            CoreChaosRequestStatus::Completed => "Completed",
            CoreChaosRequestStatus::Failed => "Failed",
            CoreChaosRequestStatus::Cancelled => "Cancelled",
            CoreChaosRequestStatus::TimedOut => "TimedOut",
        })
    }
}

impl<'de> Deserialize<'de> for CoreChaosRequestStatus {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.as_str() {
            "Pending" => Ok(CoreChaosRequestStatus::Pending),
            "InProgress" => Ok(CoreChaosRequestStatus::InProgress),
            "Completed" => Ok(CoreChaosRequestStatus::Completed),
            "Failed" => Ok(CoreChaosRequestStatus::Failed),
            "Cancelled" => Ok(CoreChaosRequestStatus::Cancelled),
            "TimedOut" => Ok(CoreChaosRequestStatus::TimedOut),
            _ => Err(serde::de::Error::custom(format!("Invalid status: {}", s))),
        }
    }
}

// Helper function for Redis HGET operations with proper type handling
async fn redis_hget<K, F, RV>(
    conn: &mut redis::Connection,
    key: K,
    field: F
) -> Result<Option<RV>> 
where
    K: ToRedisArgs,
    F: ToRedisArgs,
    RV: FromRedisValue,
{
    match conn.hget::<K, F, RV>(key, field) {
        Ok(value) => Ok(Some(value)),
        Err(e) if e.kind() == ErrorKind::Nil => Ok(None),
        Err(e) => Err(e.into())
    }
}

// Enhanced Redis operations with proper error handling
impl EnhancedRedisClient {
    pub async fn set_cached_status(&self, program_id: &Pubkey, status: &CoreChaosRequestStatus) -> Result<(), CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;
            
        let cache_key = format!("request_status:{}", program_id);
        let json = serde_json::to_string(&SerializableChaosRequestStatus(status.clone()))
            .map_err(CacheError::Serialization)?;
            
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
            
        redis::pipe()
            .atomic()
            .hset(&cache_key, "status", json)
            .hset(&cache_key, "last_update", now)
            .expire(&cache_key, CACHE_TTL_SECS as usize)
            .query(&mut conn)
            .map_err(CacheError::Redis)?;
            
        // Update metrics
        if let Ok(mut metrics) = self.metrics.write() {
            metrics.total_operations += 1;
            metrics.last_write = Some(SystemTime::now());
        }
        
        Ok(())
    }

    pub async fn get_cached_timestamp(&self, key: &str) -> Result<Option<i64>, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;
            
        redis_hget::<_, _, i64>(&mut conn, key, "last_update")
            .await
            .map_err(|e| CacheError::Redis(redis::RedisError::from((
                ErrorKind::TypeError,
                "Failed to get timestamp",
                e.to_string()
            ))))
    }

    pub async fn clear_expired_entries(&self) -> Result<u64, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;
            
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
            
        let mut cleared = 0;
        let pattern = "request_status:*";
        
        let keys: Vec<String> = conn.keys(pattern)
            .map_err(CacheError::Redis)?;
            
        for key in keys {
            if let Some(timestamp) = redis_hget::<_, _, i64>(&mut conn, &key, "last_update").await? {
                if now - timestamp > CACHE_TTL_SECS as i64 {
                    conn.del::<_, ()>(&key)
                        .map_err(CacheError::Redis)?;
                    cleared += 1;
                    
                    // Update metrics
                    if let Ok(mut metrics) = self.metrics.write() {
                        metrics.stale_entries_cleared += 1;
                    }
                }
            }
        }
        
        // Update last cleanup timestamp
        if let Ok(mut metrics) = self.metrics.write() {
            metrics.last_cleanup = Some(SystemTime::now());
        }
        
        Ok(cleared)
    }
}

#[derive(Debug, Clone)]
pub struct SerializableChaosRequestStatus(pub CoreChaosRequestStatus);

impl Serialize for SerializableChaosRequestStatus {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Convert the status to a string representation
        let status_str = match self.0 {
            CoreChaosRequestStatus::Pending => "pending",
            CoreChaosRequestStatus::InProgress => "in_progress",
            CoreChaosRequestStatus::Completed => "completed",
            CoreChaosRequestStatus::Failed => "failed",
            CoreChaosRequestStatus::Cancelled => "cancelled",
        };
        serializer.serialize_str(status_str)
    }
}

impl<'de> Deserialize<'de> for SerializableChaosRequestStatus {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let status_str = String::deserialize(deserializer)?;
        let status = match status_str.as_str() {
            "pending" => CoreChaosRequestStatus::Pending,
            "in_progress" => CoreChaosRequestStatus::InProgress,
            "completed" => CoreChaosRequestStatus::Completed,
            "failed" => CoreChaosRequestStatus::Failed,
            "cancelled" => CoreChaosRequestStatus::Cancelled,
            _ => return Err(serde::de::Error::custom("Invalid status value")),
        };
        Ok(SerializableChaosRequestStatus(status))
    }
}
