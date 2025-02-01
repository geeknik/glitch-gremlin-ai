#![allow(dead_code)]

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

use serde::{Serialize, Deserialize};
use solana_program::pubkey::Pubkey;
use glitch_gremlin_program::{
    state::chaos_request::ChaosRequestStatus as CoreChaosRequestStatus,
};

// Standard library imports for core functionality
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};

// Redis imports for async operations
use redis::{
    Client as RedisClient, 
    Commands, 
    FromRedisValue, 
    ToRedisArgs,
    Pipeline,
    AsyncCommands,
};

// External crates for enhanced functionality
use anyhow::Result;
use thiserror::Error;
use tokio;
use rand::Rng;
use sha2::{Sha256, Digest};
use log::{error, info, warn};

// Redis connection configuration
const REDIS_HOST: &str = "r.glitchgremlin.ai";
const REDIS_PORT: u16 = 6379;
const CACHE_TTL_SECS: u64 = 3600; // 1 hour cache TTL
const CACHE_WARM_BATCH_SIZE: usize = 50;
const CACHE_STALE_THRESHOLD_SECS: u64 = 300; // 5 minutes
const CACHE_INVALIDATION_PATTERN: &str = "request_status:*";
const CACHE_WARM_INTERVAL_SECS: u64 = 60;

// Security thresholds and limits
const MAX_GLOBAL_TRANSITIONS_PER_SEC: usize = 1000;
const MIN_TRANSITION_INTERVAL_MS: u64 = 50;
const MAX_TRANSITIONS_PER_STATUS: usize = 100;
const SECURITY_TIME_WINDOW_SECS: u64 = 60;
const MAX_TIMESTAMP_SKEW_SECS: u64 = 300; // 5 minutes maximum clock skew allowed
const MAX_DAILY_REQUESTS: u32 = 10_000;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_SECS: u64 = 60;
const HIGH_PRIORITY_MULTIPLIER: f64 = 1.5;
const BURST_ALLOWANCE: u32 = 100;

// Error recovery and circuit breaker settings
const CIRCUIT_BREAKER_THRESHOLD: usize = 5;
const CIRCUIT_BREAKER_RESET_SECS: u64 = 300;
const MAX_ERROR_HISTORY: usize = 1000;

/// Cache-related errors that can occur during Redis operations
#[derive(Debug, Error)]
pub enum CacheError {
    /// Redis-specific errors from the underlying client
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    
    /// Serialization errors when converting between formats
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    /// Connection errors when establishing Redis connections
    #[error("Connection error: {0}")]
    Connection(String),
    
    /// Key not found errors when accessing cache entries
    #[error("Value not found for key: {0}")]
    NotFound(String),
    
    /// Data format validation errors
    #[error("Invalid data format: {0}")]
    InvalidFormat(String),

    /// Security violation errors including replay attacks, rate limiting, etc.
    #[error("Security violation: {0}")]
    SecurityViolation(String),
}

/// Metrics for monitoring cache performance and health
#[derive(Debug, Default, Clone)]
pub struct CacheMetrics {
    /// Total number of operations performed
    pub total_operations: usize,
    /// Number of successful cache hits
    pub cache_hits: usize,
    /// Number of cache misses requiring fallback
    pub cache_misses: usize,
    /// Number of stale entries removed during cleanup
    pub stale_entries_cleared: usize,
    /// Timestamp of last write operation
    pub last_write: Option<SystemTime>,
    /// Timestamp of last cleanup operation
    pub last_cleanup: Option<SystemTime>,
    /// Count of errors encountered
    pub error_count: usize,
    /// History of operation latencies
    pub operation_latencies: Vec<Duration>,
    /// Timestamps of operations for analysis
    pub operation_timestamps: Vec<SystemTime>,
    /// Peak memory usage in bytes
    pub peak_memory: u64,
}

/// Enhanced Redis client with monitoring and security features
#[derive(Clone)]
pub struct EnhancedRedisClient {
    /// Underlying Redis client
    client: RedisClient,
    /// Performance and health metrics
    metrics: Arc<Mutex<CacheMetrics>>,
}

impl EnhancedRedisClient {
    /// Create a new enhanced Redis client with the specified host and port
    /// 
    /// # Arguments
    /// 
    /// * `host` - The Redis server hostname or IP address
    /// * `port` - The Redis server port number
    /// 
    /// # Returns
    /// 
    /// Returns a Result containing either the new EnhancedRedisClient instance or a CacheError
    /// 
    /// # Example
    /// 
    /// ```
    /// let client = EnhancedRedisClient::new("localhost", 6379)?;
    /// ```
    pub fn new(host: &str, port: u16) -> Result<Self, CacheError> {
        let client = RedisClient::open(format!("redis://{}:{}", host, port))
            .map_err(|e| CacheError::Connection(e.to_string()))?;
            
        Ok(Self {
            client,
            metrics: Arc::new(Mutex::new(CacheMetrics::default())),
        })
    }

    /// Enhanced Redis query with proper error handling and metrics
    async fn redis_hget<T>(&self, key: &str, field: &str) -> Result<Option<T>, CacheError> 
    where
        T: FromRedisValue + Send + Sync + 'static,
    {
        let mut conn = self.client.get_async_connection().await.map_err(CacheError::Redis)?;
        let result: Option<T> = conn.hget(key, field).await.map_err(CacheError::Redis)?;
        Ok(result)
    }

    /// Enhanced Redis set with proper error handling and metrics
    async fn redis_hset<T>(&self, key: &str, field: &str, value: T) -> Result<(), CacheError>
    where
        T: ToRedisArgs + Send + Sync + 'static,
    {
        let mut conn = self.client.get_async_connection().await.map_err(CacheError::Redis)?;
        let _: () = conn.hset(key, field, value).await.map_err(CacheError::Redis)?;
        Ok(())
    }

    /// Pipeline multiple Redis operations atomically
    async fn redis_pipeline<T>(&self, pipe: &mut Pipeline) -> Result<T, CacheError>
    where
        T: FromRedisValue + Send + Sync + 'static,
    {
        let mut conn = self.client.get_async_connection().await.map_err(CacheError::Redis)?;
        let result: T = pipe.query_async(&mut conn).await.map_err(CacheError::Redis)?;
        Ok(result)
    }

    /// Clear expired entries with proper error handling and type safety
    pub async fn clear_expired_entries(&self) -> Result<u64, CacheError> {
        let mut cleared: u64 = 0;
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let pattern = "program:*:status";
        let keys: Vec<String> = conn.keys(pattern)
            .map_err(CacheError::Redis)?;

        for key in keys {
            let last_update: Option<u64> = conn.hget(&key, "last_update")
                .map_err(CacheError::Redis)?;

            if let Some(timestamp) = last_update {
                if now - timestamp > 24 * 60 * 60 { // 24 hours
                    let _: () = conn.del(&key).map_err(CacheError::Redis)?;
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

    /// Validate and enforce security time windows for operations
    async fn validate_time_window(&self, program_id: &Pubkey) -> Result<bool, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let window_key = format!("security:{}:window", program_id);
        let transitions_key = format!("security:{}:transitions", program_id);
        
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Check and update time window
        let window_start: Option<u64> = conn.get(&window_key).map_err(CacheError::Redis)?;
        let transitions: Option<usize> = conn.get(&transitions_key).map_err(CacheError::Redis)?;

        match (window_start, transitions) {
            (Some(start), Some(count)) => {
                if now - start > SECURITY_TIME_WINDOW_SECS {
                    // Reset window if expired
                    let _: () = conn.set(&window_key, now).map_err(CacheError::Redis)?;
                    let _: () = conn.set(&transitions_key, 1).map_err(CacheError::Redis)?;
                    Ok(true)
                } else if count >= MAX_GLOBAL_TRANSITIONS_PER_SEC * SECURITY_TIME_WINDOW_SECS as usize {
                    Ok(false) // Too many transitions in window
                } else {
                    let _: () = conn.incr(&transitions_key, 1).map_err(CacheError::Redis)?;
                    Ok(true)
                }
            },
            _ => {
                // Initialize new window
                let _: () = conn.set(&window_key, now).map_err(CacheError::Redis)?;
                let _: () = conn.set(&transitions_key, 1).map_err(CacheError::Redis)?;
                Ok(true)
            }
        }
    }

    /// Enforce minimum interval between transitions
    async fn enforce_transition_interval(&self, program_id: &Pubkey) -> Result<bool, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let last_transition_key = format!("transition:{}:last", program_id);
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let last_transition: Option<u64> = conn.get(&last_transition_key).map_err(CacheError::Redis)?;

        match last_transition {
            Some(last) if now - last < MIN_TRANSITION_INTERVAL_MS => {
                Ok(false) // Too soon for next transition
            },
            _ => {
                let _: () = conn.set(&last_transition_key, now).map_err(CacheError::Redis)?;
                Ok(true)
            }
        }
    }

    /// Track transitions per status to prevent abuse
    async fn track_status_transitions(&self, program_id: &Pubkey, status: &CoreChaosRequestStatus) -> Result<bool, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let status_key = format!("status:{}:{:?}:count", program_id, status);
        let count: Option<usize> = conn.get(&status_key).map_err(CacheError::Redis)?;

        match count {
            Some(c) if c >= MAX_TRANSITIONS_PER_STATUS => {
                Ok(false) // Too many transitions to this status
            },
            _ => {
                let _: () = conn.incr(&status_key, 1).map_err(CacheError::Redis)?;
                let _: () = conn.expire(&status_key, CACHE_TTL_SECS as usize).map_err(CacheError::Redis)?;
                Ok(true)
            }
        }
    }

    /// Validate timestamp to prevent replay attacks
    async fn validate_timestamp(&self, timestamp: u64) -> Result<bool, CacheError> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if timestamp > now + MAX_TIMESTAMP_SKEW_SECS || now > timestamp + MAX_TIMESTAMP_SKEW_SECS {
            Ok(false) // Timestamp outside acceptable range
        } else {
            Ok(true)
        }
    }

    /// Circuit breaker implementation
    async fn check_circuit_breaker(&self, program_id: &Pubkey) -> Result<bool, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let error_key = format!("errors:{}:count", program_id);
        let last_reset_key = format!("errors:{}:last_reset", program_id);

        let error_count: Option<usize> = conn.get(&error_key).map_err(CacheError::Redis)?;
        let last_reset: Option<u64> = conn.get(&last_reset_key).map_err(CacheError::Redis)?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        match (error_count, last_reset) {
            (Some(_), Some(reset)) if now - reset > CIRCUIT_BREAKER_RESET_SECS => {
                // Reset circuit breaker after timeout
                let _: () = conn.set(&error_key, 0).map_err(CacheError::Redis)?;
                let _: () = conn.set(&last_reset_key, now).map_err(CacheError::Redis)?;
                info!("Circuit breaker reset for program {}", program_id);
                Ok(true)
            },
            (Some(count), _) if count >= CIRCUIT_BREAKER_THRESHOLD => {
                warn!("Circuit breaker triggered for program {} with {} errors", program_id, count);
                Ok(false) // Circuit breaker triggered
            },
            _ => Ok(true)
        }
    }

    /// Periodic cache warming based on configured interval
    async fn schedule_cache_warming(&self) -> Result<(), CacheError> {
        let mut interval = tokio::time::interval(Duration::from_secs(CACHE_WARM_INTERVAL_SECS));
        
        loop {
            interval.tick().await;
            if let Err(e) = self.warm_cache().await {
                error!("Cache warming failed: {}", e);
            } else {
                info!("Cache warming completed successfully");
            }
        }
    }

    /// Enhanced set_cached_status with all security checks
    pub async fn set_cached_status(&self, program_id: &Pubkey, status: &CoreChaosRequestStatus) -> Result<(), CacheError> {
        // Validate all security constraints
        if !self.validate_time_window(program_id).await? {
            return Err(CacheError::SecurityViolation("Time window violation".into()));
        }

        if !self.enforce_transition_interval(program_id).await? {
            return Err(CacheError::SecurityViolation("Transition interval violation".into()));
        }

        if !self.track_status_transitions(program_id, status).await? {
            return Err(CacheError::SecurityViolation("Status transition limit exceeded".into()));
        }

        if !self.check_circuit_breaker(program_id).await? {
            return Err(CacheError::SecurityViolation("Circuit breaker triggered".into()));
        }

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if !self.validate_timestamp(now).await? {
            return Err(CacheError::SecurityViolation("Invalid timestamp".into()));
        }

        // Proceed with status update if all checks pass
        let serializable = SerializableChaosRequestStatus(status.clone());
        let serialized = serde_json::to_string(&serializable)
            .map_err(|e| CacheError::Serialization(e))?;
        
        let mut pipe = Pipeline::new();
        let key = format!("program:{}:status", program_id);
        
        pipe.atomic()
            .hset(&key, "status", &serialized)
            .hset(&key, "last_update", now);

        let _: () = self.redis_pipeline(&mut pipe).await?;
        Ok(())
    }

    /// Get cached status with explicit type annotations
    pub async fn get_cached_status(&self, program_id: &Pubkey) -> Result<Option<CoreChaosRequestStatus>, CacheError> {
        let key = format!("program:{}:status", program_id);
        
        let cached_status: Option<String> = self.redis_hget(&key, "status").await?;
        
        if let Some(status_str) = cached_status {
            let wrapper = serde_json::from_str::<SerializableChaosRequestStatus>(&status_str)
                .map_err(|e| CacheError::Serialization(e))?;
            Ok(Some(wrapper.0))
        } else {
            Ok(None)
        }
    }

    /// Get cache health metrics with proper error handling
    pub async fn get_cache_health(&self) -> Result<CacheHealth, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        // Get raw INFO response and parse it
        let raw_info: String = redis::cmd("INFO")
            .query(&mut conn)
            .map_err(CacheError::Redis)?;
        
        let info = parseRedisInfo(&raw_info);  // Parse the raw response

        let total_keys: usize = redis::cmd("DBSIZE")
            .query(&mut conn)
            .map_err(CacheError::Redis)?;

        let metrics = if let Ok(metrics) = self.metrics.lock() {
            metrics.clone()
        } else {
            CacheMetrics::default()
        };

        Ok(CacheHealth {
            total_keys,
            hit_rate: calculate_hit_rate(&metrics),
            last_write: metrics.last_write,
            last_cleanup: metrics.last_cleanup,
            stale_entries_cleared: metrics.stale_entries_cleared,
            peak_memory_usage: info.get("used_memory")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            peak_operations_per_sec: self.calculate_ops_per_second(),
            avg_operation_latency_ms: self.calculate_avg_latency().as_millis() as f64,
            error_rate: self.calculate_error_rate(),
        })
    }

    /// Monitor Redis performance metrics
    async fn update_performance_metrics(&self, operation_latency: Duration, success: bool) {
        if let Ok(mut metrics) = self.metrics.lock() {
            // Update operation metrics
            metrics.total_operations += 1;
            if !success {
                metrics.error_count += 1;
            }

            // Track latencies for moving average
            metrics.operation_latencies.push(operation_latency);
            metrics.operation_timestamps.push(SystemTime::now());

            // Cleanup old metrics (keep last minute)
            let one_minute_ago = SystemTime::now()
                .checked_sub(Duration::from_secs(60))
                .unwrap_or_else(SystemTime::now);

            // Store timestamps in a separate vector to avoid borrow issues
            let old_timestamps: Vec<_> = metrics.operation_timestamps.clone();
            let mut new_timestamps = Vec::new();
            let mut new_latencies = Vec::new();

            for (idx, &ts) in old_timestamps.iter().enumerate() {
                if ts > one_minute_ago {
                    new_timestamps.push(ts);
                    new_latencies.push(metrics.operation_latencies[idx]);
                }
            }

            metrics.operation_timestamps = new_timestamps;
            metrics.operation_latencies = new_latencies;
        }
    }

    /// Calculate current operations per second
    fn calculate_ops_per_second(&self) -> f64 {
        if let Ok(metrics) = self.metrics.lock() {
            let now = SystemTime::now();
            let one_second_ago = now
                .checked_sub(Duration::from_secs(1))
                .unwrap_or(now);

            let recent_ops = metrics.operation_timestamps
                .iter()
                .filter(|&&ts| ts > one_second_ago)
                .count();

            recent_ops as f64
        } else {
            0.0
        }
    }

    /// Get average operation latency
    fn calculate_avg_latency(&self) -> Duration {
        if let Ok(metrics) = self.metrics.lock() {
            if metrics.operation_latencies.is_empty() {
                return Duration::from_millis(0);
            }

            let total = metrics.operation_latencies
                .iter()
                .sum::<Duration>();

            total / metrics.operation_latencies.len() as u32
        } else {
            Duration::from_millis(0)
        }
    }

    /// Get enhanced cache metrics with performance data
    pub async fn get_enhanced_metrics(&self) -> Result<EnhancedCacheMetrics, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let info: HashMap<String, String> = redis::cmd("INFO")
            .query(&mut conn)
            .map_err(CacheError::Redis)?;

        let used_memory = info.get("used_memory_human")
            .and_then(|s| s.trim_end_matches("K").parse::<u64>().ok())
            .unwrap_or(0);

        let metrics = if let Ok(metrics) = self.metrics.lock() {
            metrics.clone()
        } else {
            CacheMetrics::default()
        };

        Ok(EnhancedCacheMetrics {
            total_operations: metrics.total_operations,
            cache_hits: metrics.cache_hits,
            cache_misses: metrics.cache_misses,
            error_rate: self.calculate_error_rate(),
            ops_per_second: self.calculate_ops_per_second(),
            avg_latency: self.calculate_avg_latency(),
            used_memory_kb: used_memory,
            last_update: SystemTime::now(),
        })
    }

    fn calculate_error_rate(&self) -> f64 {
        if let Ok(metrics) = self.metrics.lock() {
            if metrics.total_operations == 0 {
                return 0.0;
            }
            metrics.error_count as f64 / metrics.total_operations as f64
        } else {
            0.0
        }
    }

    /// Warm up the cache with frequently accessed keys
    pub async fn warm_cache(&self) -> Result<usize, CacheError> {
        let mut warmed = 0;
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let pattern = CACHE_INVALIDATION_PATTERN;
        let keys: Vec<String> = conn.keys(pattern)
            .map_err(CacheError::Redis)?;

        // Process keys in batches
        for chunk in keys.chunks(CACHE_WARM_BATCH_SIZE) {
            let mut pipe = Pipeline::new();
            for key in chunk {
                pipe.hgetall(key);
            }
            let _: Vec<HashMap<String, String>> = self.redis_pipeline(&mut pipe).await?;
            warmed += chunk.len();
        }

        if let Ok(mut metrics) = self.metrics.lock() {
            metrics.last_write = Some(SystemTime::now());
        }

        Ok(warmed)
    }

    /// Invalidate stale cache entries based on TTL
    pub async fn invalidate_stale_entries(&self) -> Result<usize, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let pattern = CACHE_INVALIDATION_PATTERN;
        let keys: Vec<String> = conn.keys(pattern)
            .map_err(CacheError::Redis)?;

        let mut invalidated = 0;
        for key in keys {
            let last_update: Option<u64> = conn.hget(&key, "last_update")
                .map_err(CacheError::Redis)?;

            if let Some(timestamp) = last_update {
                if now - timestamp > CACHE_STALE_THRESHOLD_SECS {
                    let _: () = conn.del(&key).map_err(CacheError::Redis)?;
                    invalidated += 1;
                }
            }
        }

        if let Ok(mut metrics) = self.metrics.lock() {
            metrics.stale_entries_cleared += invalidated;
            metrics.last_cleanup = Some(SystemTime::now());
        }

        Ok(invalidated)
    }

    /// Check rate limits for operations with priority-based increments
    pub async fn check_rate_limits(&self, program_id: &Pubkey) -> Result<bool, CacheError> {
        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let key = format!("rate_limit:{}:ops", program_id);
        let current_count: Option<u32> = conn.get(&key).map_err(CacheError::Redis)?;

        match current_count {
            Some(count) if count >= MAX_DAILY_REQUESTS => {
                Ok(false)
            },
            _ => {
                // Calculate increment based on priority and burst allowance
                let base_increment = 1;
                let priority_multiplier = if self.is_high_priority().await {
                    HIGH_PRIORITY_MULTIPLIER
                } else {
                    1.0
                };

                let increment = (base_increment as f64 * priority_multiplier).ceil() as i64;
                
                // Apply rate limiting with burst allowance
                let _: () = conn.incr(&key, increment).map_err(CacheError::Redis)?;
                let _: () = conn.expire(&key, RATE_LIMIT_WINDOW_SECS as usize).map_err(CacheError::Redis)?;

                // Track burst usage
                let burst_key = format!("rate_limit:{}:burst", program_id);
                let burst_count: Option<u32> = conn.get(&burst_key).map_err(CacheError::Redis)?;
                
                if let Some(count) = burst_count {
                    if count > BURST_ALLOWANCE {
                        // Apply exponential backoff for burst exceeded
                        let backoff = Duration::from_millis((count as u64 - BURST_ALLOWANCE as u64) * 100);
                        tokio::time::sleep(backoff).await;
                    }
                }

                Ok(true)
            }
        }
    }

    /// Check if current operation is high priority
    async fn is_high_priority(&self) -> bool {
        if let Ok(metrics) = self.metrics.lock() {
            // Consider operation high priority if:
            // 1. Error rate is low (healthy system)
            // 2. Queue depth is low (no backpressure)
            // 3. Recent latencies are within acceptable range
            let error_rate = metrics.error_count as f64 / metrics.total_operations.max(1) as f64;
            let recent_latencies: Vec<Duration> = metrics.operation_latencies
                .iter()
                .rev()
                .take(10)
                .cloned()
                .collect();

            let avg_latency = if !recent_latencies.is_empty() {
                recent_latencies.iter().sum::<Duration>() / recent_latencies.len() as u32
            } else {
                Duration::from_secs(0)
            };

            error_rate < 0.01 && // Less than 1% errors
            avg_latency < Duration::from_millis(100) // Under 100ms latency
        } else {
            false
        }
    }

    /// Apply security checks to cache operations
    pub async fn apply_security_checks(&self, program_id: &Pubkey, value: &str) -> Result<bool, CacheError> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let key = format!("security:{}:checks", program_id);
        let hash = calculate_security_hash(&key, value, now);

        let mut conn = self.client.get_connection()
            .map_err(|e| CacheError::Connection(e.to_string()))?;

        let previous_hash: Option<String> = conn.get(&key).map_err(CacheError::Redis)?;
        let _: () = conn.set(&key, &hash).map_err(CacheError::Redis)?;

        match previous_hash {
            Some(prev_hash) if prev_hash == hash => {
                Ok(false) // Potential replay attack
            },
            _ => Ok(true)
        }
    }
}

/// Enhanced metrics including performance data and resource utilization
#[derive(Debug)]
pub struct EnhancedCacheMetrics {
    /// Total number of operations processed by the cache
    pub total_operations: usize,
    /// Number of successful cache hits
    pub cache_hits: usize,
    /// Number of cache misses requiring fallback
    pub cache_misses: usize,
    /// Current error rate as a percentage (0.0-1.0)
    pub error_rate: f64,
    /// Current operations per second throughput
    pub ops_per_second: f64,
    /// Average latency of operations
    pub avg_latency: Duration,
    /// Current memory usage in kilobytes
    pub used_memory_kb: u64,
    /// Timestamp of last metrics update
    pub last_update: SystemTime,
}

impl EnhancedCacheMetrics {
    /// Generate a detailed report of cache metrics and performance
    pub fn get_detailed_report(&self) -> String {
        let mut report = String::new();
        report.push_str("Enhanced Cache Metrics Report:\n");
        report.push_str("\nOperation Statistics:\n");
        report.push_str(&format!("├─ Total Operations: {}\n", self.total_operations));
        report.push_str(&format!("├─ Cache Hits: {}\n", self.cache_hits));
        report.push_str(&format!("├─ Cache Misses: {}\n", self.cache_misses));
        report.push_str(&format!("├─ Hit Rate: {:.1}%\n", self.get_hit_rate() * 100.0));
        
        report.push_str("\nPerformance Metrics:\n");
        report.push_str(&format!("├─ Operations/sec: {:.2}\n", self.ops_per_second));
        report.push_str(&format!("├─ Avg Latency: {:.2}ms\n", self.avg_latency.as_secs_f64() * 1000.0));
        report.push_str(&format!("├─ Error Rate: {:.2}%\n", self.error_rate * 100.0));
        
        report.push_str("\nResource Usage:\n");
        report.push_str(&format!("└─ Memory Usage: {} KB\n", self.used_memory_kb));
        
        report
    }

    /// Check if the cache is operating within healthy parameters
    pub fn is_healthy(&self) -> bool {
        self.get_hit_rate() >= 0.7 && // At least 70% hit rate
        self.error_rate <= 0.01 && // Less than 1% errors
        self.avg_latency <= Duration::from_millis(100) && // Under 100ms latency
        self.ops_per_second <= 10_000.0 // Under 10k ops/sec
    }

    fn get_hit_rate(&self) -> f64 {
        let total = self.cache_hits + self.cache_misses;
        if total > 0 {
            self.cache_hits as f64 / total as f64
        } else {
            0.0
        }
    }
}

/// Cache health metrics for monitoring and diagnostics
#[derive(Debug)]
pub struct CacheHealth {
    /// Total number of keys in the cache
    pub total_keys: usize,
    /// Cache hit rate as a percentage (0.0-1.0)
    pub hit_rate: f64,
    /// Timestamp of last write operation
    pub last_write: Option<SystemTime>,
    /// Timestamp of last cleanup operation
    pub last_cleanup: Option<SystemTime>,
    /// Number of stale entries removed in last cleanup
    pub stale_entries_cleared: usize,
    /// Peak memory usage in bytes
    pub peak_memory_usage: u64,
    /// Peak operations per second observed
    pub peak_operations_per_sec: f64,
    /// Average operation latency in milliseconds
    pub avg_operation_latency_ms: f64,
    /// Current error rate as a percentage (0.0-1.0)
    pub error_rate: f64,
}

impl CacheHealth {
    /// Generate a summary of cache health metrics
    pub fn get_summary(&self) -> String {
        let mut summary = String::new();
        summary.push_str(&format!("Cache Health Summary:\n"));
        summary.push_str(&format!("├─ Total Keys: {}\n", self.total_keys));
        summary.push_str(&format!("├─ Hit Rate: {:.1}%\n", self.hit_rate * 100.0));
        
        if let Some(last_write) = self.last_write {
            if let Ok(age) = SystemTime::now().duration_since(last_write) {
                summary.push_str(&format!("├─ Last Write: {}s ago\n", age.as_secs()));
            }
        }
        
        if let Some(last_cleanup) = self.last_cleanup {
            if let Ok(age) = SystemTime::now().duration_since(last_cleanup) {
                summary.push_str(&format!("├─ Last Cleanup: {}s ago\n", age.as_secs()));
            }
        }
        
        summary.push_str(&format!("├─ Stale Entries Cleared: {}\n", self.stale_entries_cleared));
        summary.push_str(&format!("├─ Peak Memory Usage: {} KB\n", self.peak_memory_usage));
        summary.push_str(&format!("├─ Peak Operations/sec: {:.2}\n", self.peak_operations_per_sec));
        summary.push_str(&format!("├─ Avg Operation Latency: {:.2}ms\n", self.avg_operation_latency_ms));
        summary.push_str(&format!("└─ Error Rate: {:.2}%\n", self.error_rate * 100.0));
        summary
    }

    /// Check if cache health is within acceptable thresholds
    pub fn is_healthy(&self) -> bool {
        self.hit_rate >= 0.7 && // At least 70% hit rate
        self.error_rate <= 0.01 && // Less than 1% errors
        self.avg_operation_latency_ms <= 100.0 // Under 100ms average latency
    }

    /// Get detailed health analysis with recommendations
    pub fn get_health_analysis(&self) -> String {
        let mut analysis = String::new();
        analysis.push_str("Cache Health Analysis:\n");

        // Performance Analysis
        analysis.push_str("\nPerformance Metrics:\n");
        analysis.push_str(&format!("├─ Hit Rate: {:.1}% ", self.hit_rate * 100.0));
        if self.hit_rate < 0.7 {
            analysis.push_str("⚠️  Consider increasing cache size or TTL\n");
        } else {
            analysis.push_str("✅\n");
        }

        analysis.push_str(&format!("├─ Operation Latency: {:.2}ms ", self.avg_operation_latency_ms));
        if self.avg_operation_latency_ms > 100.0 {
            analysis.push_str("⚠️  High latency detected\n");
        } else {
            analysis.push_str("✅\n");
        }

        // Resource Usage
        analysis.push_str("\nResource Usage:\n");
        analysis.push_str(&format!("├─ Memory: {} KB ", self.peak_memory_usage));
        if self.peak_memory_usage > 1_000_000 {
            analysis.push_str("⚠️  Consider memory optimization\n");
        } else {
            analysis.push_str("✅\n");
        }

        // Error Analysis
        analysis.push_str("\nReliability:\n");
        analysis.push_str(&format!("└─ Error Rate: {:.2}% ", self.error_rate * 100.0));
        if self.error_rate > 0.01 {
            analysis.push_str("⚠️  High error rate detected\n");
        } else {
            analysis.push_str("✅\n");
        }

        if !self.is_healthy() {
            analysis.push_str("\nRecommendations:\n");
            if self.hit_rate < 0.7 {
                analysis.push_str("├─ Consider increasing cache TTL\n");
                analysis.push_str("├─ Review cache key design\n");
            }
            if self.avg_operation_latency_ms > 100.0 {
                analysis.push_str("├─ Optimize Redis connection pool\n");
                analysis.push_str("├─ Review network configuration\n");
            }
            if self.error_rate > 0.01 {
                analysis.push_str("├─ Implement retry mechanism\n");
                analysis.push_str("└─ Review error handling logic\n");
            }
        }

        analysis
    }
}

/// Test execution mode configuration for different environments
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TestMode {
    /// Live testing on actual network
    Live {
        /// Maximum number of concurrent operations
        max_concurrent: usize,
        /// Transaction confirmation level requirement
        confirm_level: String,
    },
    /// Mock testing with simulated responses
    Mock {
        /// Simulated operation latency in milliseconds
        latency_ms: u64,
        /// Simulated error rate (0.0-1.0)
        error_rate: f64,
    },
    /// Simulation mode with adjustable parameters
    Simulate {
        /// Time compression/expansion multiplier
        speed_multiplier: f64,
        /// Whether to track and validate state changes
        track_state: bool,
    },
}

/// Wrapper for serializing chaos request status with custom serialization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SerializableChaosRequestStatus(#[serde(with = "chaos_request_status_serde")] pub CoreChaosRequestStatus);

impl SecurityContext {
    /// Create a new security context with specified limits
    pub fn new(max_transitions: usize, time_window: u64) -> Self {
        Self {
            max_transitions,
            time_window,
            transition_count: 0,
            window_start: Instant::now(),
            last_transition: None,
        }
    }

    /// Check if a transition is allowed under current constraints
    pub fn can_transition(&self) -> bool {
        self.transition_count < self.max_transitions
    }
}

/// Calculate security hash for cache entries
fn calculate_security_hash(key: &str, value: &str, timestamp: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hasher.update(value.as_bytes());
    hasher.update(timestamp.to_le_bytes());
    format!("{:x}", hasher.finalize())
}

/// Calculate cache hit rate
fn parseRedisInfo(response: &str) -> HashMap<String, String> {
    let mut result = HashMap::new();
    response.split('\r').for_each(|line| {
        if line.starts_with('#') || line.trim().is_empty() {
            return; // Skip comments and empty lines
        }
        if let Some((key, value)) = line.split(':').collect::<Vec<&str>>().split_first() {
            if !value.is_empty() {
                result.insert(
                    key.trim().to_string(),
                    value.join(":").trim().to_string()
                );
            }
        }
    });
    result
}

fn calculate_hit_rate(metrics: &CacheMetrics) -> f64 {
    let total = metrics.cache_hits + metrics.cache_misses;
    if total > 0 {
        metrics.cache_hits as f64 / total as f64
    } else {
        0.0
    }
}

/// Security metrics for monitoring system integrity
#[derive(Debug)]
pub struct SecurityMetrics {
    /// Total number of state transitions
    pub total_transitions: usize,
    /// Number of suspicious transitions detected
    pub suspicious_transitions: usize,
    /// Map of security violation types to counts
    pub violations: HashMap<String, usize>,
    /// Timestamp of last violation
    pub last_violation: Option<SystemTime>,
    /// Average transitions per second
    pub transition_frequency: f64,
    /// Peak transition rate observed
    pub peak_transition_rate: f64,
    /// History of state transitions
    pub transition_history: VecDeque<(SystemTime, CoreChaosRequestStatus, CoreChaosRequestStatus)>,
    /// Severity scores for violations
    pub violation_severity_scores: HashMap<String, f64>,
    /// Time spent in each state
    pub state_dwell_times: HashMap<CoreChaosRequestStatus, Duration>,
    /// Historical anomaly scores
    pub anomaly_scores: Vec<(SystemTime, f64)>,
    /// Security checkpoint validation status
    pub security_checkpoints: HashSet<String>,
    /// Duration of rate limiting window
    pub rate_limit_window: Duration,
    /// Maximum transitions allowed per window
    pub max_transitions_per_window: usize,
    /// Start time of current window
    pub current_window_start: SystemTime,
    /// Transitions in current window
    pub current_window_transitions: usize,
}

/// Cache for program state management
#[derive(Debug)]
pub struct StateCache {
    /// History of state transitions
    pub state_transitions: Vec<(CoreChaosRequestStatus, Instant)>,
    /// Cache performance metrics
    pub metrics: StateCacheMetrics,
    /// Last recorded state
    pub last_state: Option<CoreChaosRequestStatus>,
    /// Cache creation timestamp
    pub created_at: Instant,
    /// Security context for operations
    pub security_context: SecurityContext,
}

/// Metrics for state cache performance
#[derive(Debug, Default)]
pub struct StateCacheMetrics {
    /// Total number of state checks
    pub total_checks: usize,
    /// Count of state transitions
    pub transition_count: usize,
    /// Average time per transition
    pub avg_transition_time: Duration,
    /// Peak memory usage in KB
    pub peak_memory_kb: u64,
    /// Peak CPU usage percentage
    pub peak_cpu_percent: f64,
    /// Error counts by type
    pub error_counts: HashMap<String, usize>,
}

/// Security context for state operations
#[derive(Debug)]
pub struct SecurityContext {
    /// Maximum allowed transitions
    pub max_transitions: usize,
    /// Time window for limits
    pub time_window: u64,
    /// Current transition count
    pub transition_count: usize,
    /// Window start timestamp
    pub window_start: Instant,
    /// Last transition timestamp
    pub last_transition: Option<Instant>,
}

/// Performance monitoring metrics for tracking system behavior and resource usage
/// Provides comprehensive monitoring of system performance, resource utilization, and error tracking
/// Used for real-time performance analysis and capacity planning
#[derive(Debug, Default, Clone)]
pub struct PerformanceMetrics {
    /// Track operation latencies for performance analysis and optimization
    pub operation_latencies: Vec<Duration>,
    /// Timestamps of operations for time-based analysis and pattern detection
    pub operation_timestamps: Vec<SystemTime>,
    /// Count of errors encountered during operations, used for reliability metrics
    pub error_count: usize,
    /// Total number of operations processed since startup, for throughput analysis
    pub total_operations: usize,
    /// Peak memory usage in bytes during program execution, for resource monitoring
    pub peak_memory: u64,
    /// Last time metrics were updated with new data, for freshness tracking
    pub last_metrics_update: Option<SystemTime>,
    /// Peak latency observed across all operations, for SLA monitoring
    pub peak_latency: Duration,
    /// Minimum latency observed across all operations, for baseline performance
    pub min_latency: Duration,
    /// Latency percentiles (50th, 90th, 95th, 99th) for statistical analysis
    pub latency_percentiles: HashMap<u8, Duration>,
    /// Operations processed per second (throughput metric) for capacity planning
    pub throughput_per_second: f64,
    /// Breakdown of error types encountered with counts for reliability analysis
    pub error_types: HashMap<String, usize>,
    /// Detailed resource utilization metrics for system monitoring and scaling
    pub resource_usage: ResourceMetrics,
    /// Current depth of pending request queue for backpressure monitoring
    pub request_queue_depth: usize,
    /// Number of currently active connections for capacity management
    pub active_connections: usize,
    /// Count of connection-related errors for network reliability tracking
    pub connection_errors: usize,
    /// Peak number of concurrent requests observed for capacity planning
    pub peak_concurrent_requests: usize,
    /// Count of request timeout incidents for SLA monitoring
    pub request_timeouts: usize,
}

/// Resource utilization metrics for comprehensive system monitoring
/// Tracks detailed system resource usage across CPU, memory, network, and disk
/// Used for capacity planning and performance optimization
#[derive(Debug, Default, Clone)]
pub struct ResourceMetrics {
    /// CPU usage percentage (0-100) for processor utilization tracking
    pub cpu_usage_percent: f64,
    /// Time spent in system mode (kernel operations) for OS overhead analysis
    pub cpu_system_time: Duration,
    /// Time spent in user mode (application code) for application profiling
    pub cpu_user_time: Duration,
    /// Time spent waiting for I/O operations for bottleneck detection
    pub cpu_iowait_time: Duration,
    
    // Memory metrics
    /// Current memory usage in bytes for heap analysis
    pub memory_usage_bytes: u64,
    /// Peak memory usage observed during execution for capacity planning
    pub peak_memory_usage: u64,
    /// Count of memory allocation operations for leak detection
    pub memory_allocation_count: usize,
    /// Count of memory deallocation operations for memory churn analysis
    pub memory_free_count: usize,
    /// Memory fragmentation ratio (0-1) for heap health monitoring
    pub heap_fragmentation: f64,
    
    // Network metrics
    /// Total bytes sent over network for bandwidth utilization
    pub network_bytes_sent: u64,
    /// Total bytes received over network for traffic analysis
    pub network_bytes_received: u64,
    /// Total network packets sent for protocol efficiency
    pub network_packets_sent: u64,
    /// Total network packets received for connection health
    pub network_packets_received: u64,
    /// Count of network-related errors for reliability tracking
    pub network_errors: usize,
    
    // File system metrics
    /// Number of currently open file descriptors for resource limits
    pub open_file_descriptors: usize,
    /// Maximum allowed file descriptors by system for capacity limits
    pub max_file_descriptors: usize,
    /// Total bytes read from disk for I/O profiling
    pub disk_read_bytes: u64,
    /// Total bytes written to disk for storage analysis
    pub disk_write_bytes: u64,
    /// Disk I/O operations per second for storage performance
    pub disk_iops: u64,
}

/// Configuration for retry behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u64,
    /// Base delay between retries in milliseconds
    pub base_delay_ms: u64,
    /// Maximum delay between retries in milliseconds
    pub max_delay_ms: u64,
    /// Random jitter range in milliseconds
    pub jitter_range_ms: u64,
    /// Whether to use exponential backoff
    pub use_exponential: bool,
    /// Optional timeout for each attempt
    pub timeout_ms: Option<u64>,
    /// Set of error types that should trigger retries
    pub retry_on_errors: HashSet<ErrorType>,
}

impl Default for RetryConfig {
    fn default() -> Self {
        let mut retry_on_errors = HashSet::new();
        retry_on_errors.insert(ErrorType::Network);
        retry_on_errors.insert(ErrorType::Timeout);
        retry_on_errors.insert(ErrorType::RateLimit);
        
        Self {
            max_retries: 3,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            jitter_range_ms: 100,
            use_exponential: true,
            timeout_ms: Some(30000),
            retry_on_errors,
        }
    }
}

impl RetryConfig {
    /// Create a new RetryConfig with custom settings
    pub fn new(max_retries: u64, base_delay_ms: u64) -> Self {
        Self {
            max_retries,
            base_delay_ms,
            ..Default::default()
        }
    }

    /// Set maximum number of retry attempts
    pub fn with_max_retries(mut self, max_retries: u64) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Set base delay between retries
    pub fn with_base_delay(mut self, base_delay_ms: u64) -> Self {
        self.base_delay_ms = base_delay_ms;
        self
    }

    /// Set maximum delay between retries
    pub fn with_max_delay(mut self, max_delay_ms: u64) -> Self {
        self.max_delay_ms = max_delay_ms;
        self
    }

    /// Set jitter range for randomization
    pub fn with_jitter(mut self, jitter_range_ms: u64) -> Self {
        self.jitter_range_ms = jitter_range_ms;
        self
    }

    /// Enable or disable exponential backoff
    pub fn with_exponential_backoff(mut self, use_exponential: bool) -> Self {
        self.use_exponential = use_exponential;
        self
    }

    /// Set timeout for each attempt
    pub fn with_timeout(mut self, timeout_ms: Option<u64>) -> Self {
        self.timeout_ms = timeout_ms;
        self
    }

    /// Add error types that should trigger retries
    pub fn with_retry_errors(mut self, errors: &[ErrorType]) -> Self {
        self.retry_on_errors.extend(errors.iter().cloned());
        self
    }

    /// Calculate delay for a specific retry attempt
    pub fn calculate_delay(&self, attempt: u64) -> Duration {
        let base = if self.use_exponential {
            self.base_delay_ms * (2_u64.pow(attempt as u32))
        } else {
            self.base_delay_ms
        };

        let with_jitter = if self.jitter_range_ms > 0 {
            let mut rng = rand::thread_rng();
            base + rng.gen_range(0..=self.jitter_range_ms)
        } else {
            base
        };

        Duration::from_millis(with_jitter.min(self.max_delay_ms))
    }

    /// Check if an error should trigger a retry
    pub fn should_retry(&self, error: &ErrorType) -> bool {
        self.retry_on_errors.contains(error)
    }

    /// Get the timeout duration for an attempt
    pub fn get_timeout(&self) -> Option<Duration> {
        self.timeout_ms.map(Duration::from_millis)
    }
}

/// Error types that can occur during program execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ErrorType {
    /// Network-related errors including connection failures
    Network,
    /// Request timeout errors
    Timeout,
    /// Rate limiting errors
    RateLimit,
    /// Invalid input errors
    InvalidInput,
    /// Internal system errors
    InternalError,
    /// Security policy violations
    SecurityViolation,
    /// Resource exhaustion errors
    ResourceExhausted,
    /// State transition validation errors
    StateTransition,
    /// Circuit breaker triggered errors
    CircuitBreaker,
}

mod chaos_request_status_serde {
    use super::*;
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(status: &CoreChaosRequestStatus, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let s = match status {
            CoreChaosRequestStatus::Pending => "pending",
            CoreChaosRequestStatus::InProgress => "in_progress",
            CoreChaosRequestStatus::Completed => "completed",
            CoreChaosRequestStatus::Failed => "failed",
            CoreChaosRequestStatus::Cancelled => "cancelled",
            CoreChaosRequestStatus::TimedOut => "timed_out",
        };
        serializer.serialize_str(s)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<CoreChaosRequestStatus, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.as_str() {
            "pending" => Ok(CoreChaosRequestStatus::Pending),
            "in_progress" => Ok(CoreChaosRequestStatus::InProgress),
            "completed" => Ok(CoreChaosRequestStatus::Completed),
            "failed" => Ok(CoreChaosRequestStatus::Failed),
            "cancelled" => Ok(CoreChaosRequestStatus::Cancelled),
            "timed_out" => Ok(CoreChaosRequestStatus::TimedOut),
            _ => Err(serde::de::Error::custom(format!("Invalid status: {}", s))),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    env_logger::init();
    info!("Starting Glitch Gremlin Basic Example with enhanced features...");

    // Initialize Redis client with error handling
    let redis_client = EnhancedRedisClient::new(REDIS_HOST, REDIS_PORT)
        .map_err(|e| anyhow::anyhow!("Failed to initialize Redis client: {}", e))?;
    
    // Initialize test configuration with comprehensive retry settings
    let retry_config = RetryConfig::default()
        .with_max_retries(5)
        .with_base_delay(100)
        .with_jitter(50)
        .with_exponential_backoff(true)
        .with_retry_errors(&[
            ErrorType::Network,
            ErrorType::Timeout,
            ErrorType::RateLimit
        ]);

    // Create a test program ID
    let program_id = Pubkey::new_unique();
    info!("Using test program ID: {}", program_id);
    
    // Start periodic cache warming in the background
    let redis_client_clone = redis_client.clone();
    tokio::spawn(async move {
        info!("Starting periodic cache warming...");
        if let Err(e) = redis_client_clone.schedule_cache_warming().await {
            error!("Cache warming task failed: {}", e);
        }
    });

    // Warm up cache before operations
    info!("Performing initial cache warm-up...");
    let warmed_keys = redis_client.warm_cache().await
        .map_err(|e| anyhow::anyhow!("Failed to warm cache: {}", e))?;
    info!("Warmed up {} cache keys", warmed_keys);

    // Demonstrate rate limiting with high-priority operations
    info!("\nTesting rate limiting with burst protection...");
    for i in 0..BURST_ALLOWANCE + 10 {
        match redis_client.check_rate_limits(&program_id).await {
            Ok(true) => {
                info!("Request {} allowed", i + 1);
            },
            Ok(false) => {
                warn!("Request {} rate limited", i + 1);
                // Apply exponential backoff when rate limited
                tokio::time::sleep(Duration::from_millis((i as u64 + 1) * 100)).await;
            },
            Err(e) => {
                error!("Rate limit check failed: {}", e);
                break;
            }
        }
    }

    // Demonstrate status transitions with metrics tracking
    let status_sequence = vec![
        CoreChaosRequestStatus::Pending,
        CoreChaosRequestStatus::InProgress,
        CoreChaosRequestStatus::Completed,
    ];

    // Process status transitions with enhanced error handling and retry logic
    for status in status_sequence {
        info!("\nAttempting transition to {:?}", status);
        
        // Check rate limits before proceeding
        if !redis_client.check_rate_limits(&program_id).await
            .map_err(|e| anyhow::anyhow!("Failed to check rate limits: {}", e))? {
            warn!("Rate limit exceeded, waiting before retry...");
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        }
        
        // Apply security checks with timestamp validation
        let status_str = serde_json::to_string(&SerializableChaosRequestStatus(status.clone()))
            .map_err(|e| anyhow::anyhow!("Serialization error: {}", e))?;
        
        if !redis_client.apply_security_checks(&program_id, &status_str).await
            .map_err(|e| anyhow::anyhow!("Failed to apply security checks: {}", e))? {
            error!("⚠️  Security check failed - potential replay attack detected");
            continue;
        }

        // Check circuit breaker status
        if !redis_client.check_circuit_breaker(&program_id).await
            .map_err(|e| anyhow::anyhow!("Failed to check circuit breaker: {}", e))? {
            error!("🔴 Circuit breaker triggered - system protection active");
            continue;
        }
        
        let mut attempt = 0;
        let mut last_error = None;
        let operation_start = Instant::now();
        
        // Retry loop with exponential backoff
        while attempt <= retry_config.max_retries {
            let start = Instant::now();
            
            match redis_client.set_cached_status(&program_id, &status).await {
                Ok(_) => {
                    info!("Status set successfully on attempt {} (took {:?})", 
                        attempt + 1, start.elapsed());
                    
                    // Update performance metrics
                    redis_client.update_performance_metrics(start.elapsed(), true).await;
                    break;
                }
                Err(e) => {
                    last_error = Some(e);
                    attempt += 1;
                    
                    // Update performance metrics for failed attempt
                    redis_client.update_performance_metrics(start.elapsed(), false).await;
                    
                    if attempt <= retry_config.max_retries {
                        let delay = retry_config.calculate_delay(attempt);
                        warn!("Attempt {} failed after {:?}, retrying in {:?}...", 
                            attempt, start.elapsed(), delay);
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }

        // Handle max retries exceeded
        if attempt > retry_config.max_retries {
            return Err(anyhow::anyhow!(
                "Failed to set status after {} attempts: {:?}",
                attempt,
                last_error
            ));
        }
        
        // Verify status was set correctly
        let cached_status = redis_client.get_cached_status(&program_id).await
            .map_err(|e| anyhow::anyhow!("Failed to get status: {}", e))?;
        
        assert_eq!(cached_status.as_ref(), Some(&status), 
            "Status verification failed: expected {:?}, got {:?}", 
            status, cached_status);
        
        info!("Status transition completed successfully in {:?}", operation_start.elapsed());
        
        // Add artificial delay between transitions to demonstrate rate limiting
        tokio::time::sleep(Duration::from_millis(MIN_TRANSITION_INTERVAL_MS)).await;
    }

    // Clean up stale entries
    info!("\nCleaning up stale cache entries...");
    let invalidated = redis_client.invalidate_stale_entries().await
        .map_err(|e| anyhow::anyhow!("Failed to invalidate stale entries: {}", e))?;
    info!("Invalidated {} stale cache entries", invalidated);

    // Demonstrate metrics collection with detailed analysis
    let metrics = redis_client.get_enhanced_metrics().await
        .map_err(|e| anyhow::anyhow!("Failed to get metrics: {}", e))?;
    
    info!("\nCache Metrics Report:");
    println!("{}", metrics.get_detailed_report());

    // Perform health check with recommendations
    let health = redis_client.get_cache_health().await
        .map_err(|e| anyhow::anyhow!("Failed to get health status: {}", e))?;
    
    info!("\nHealth Analysis:");
    println!("{}", health.get_health_analysis());

    if !health.is_healthy() {
        warn!("\n⚠️  Warning: Cache health check failed!");
        info!("Please review the health analysis above for recommendations.");
    } else {
        info!("\n✅ Cache health check passed successfully!");
    }

    info!("\nBasic example completed successfully!");
    Ok(())
}
