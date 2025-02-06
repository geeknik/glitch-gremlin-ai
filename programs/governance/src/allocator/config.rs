use {
    nexus_zkvm::security::SecurityLevel,
    serde::{Deserialize, Serialize},
    std::time::Duration,
};

/// Configuration for the Gremlin Secure Allocator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocatorConfig {
    /// Security level for memory operations
    pub security_level: SecurityLevel,
    
    /// Maximum memory that can be allocated (in bytes)
    pub max_memory: usize,
    
    /// Maximum number of concurrent allocations
    pub max_allocations: usize,
    
    /// Memory proof generation interval
    pub proof_interval: Duration,
    
    /// Whether to enable memory guards
    pub enable_guards: bool,
    
    /// Proof verification settings
    pub proof_settings: ProofSettings,
    
    /// Memory monitoring configuration
    pub monitoring: MonitoringConfig,
}

/// Settings for zero-knowledge proof generation and verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofSettings {
    /// Hash function to use for proofs
    pub hash_function: String,
    
    /// Minimum security level for proofs
    pub min_security_level: u8,
    
    /// Whether to verify proofs immediately after generation
    pub verify_immediately: bool,
    
    /// Timeout for proof operations
    pub operation_timeout: Duration,
}

/// Configuration for memory monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    /// Interval for statistics collection
    pub stats_interval: Duration,
    
    /// Memory usage threshold for alerts (0.0 - 1.0)
    pub usage_threshold: f64,
    
    /// Whether to track peak memory usage
    pub track_peak_usage: bool,
    
    /// Maximum memory fragmentation ratio allowed
    pub max_fragmentation: f64,
    
    /// Whether to enable detailed allocation tracking
    pub detailed_tracking: bool,
}

impl Default for AllocatorConfig {
    fn default() -> Self {
        Self {
            security_level: SecurityLevel::Maximum,
            max_memory: 1024 * 1024 * 1024, // 1GB
            max_allocations: 1_000_000,
            proof_interval: Duration::from_secs(60),
            enable_guards: true,
            proof_settings: ProofSettings {
                hash_function: "poseidon".to_string(),
                min_security_level: 128,
                verify_immediately: true,
                operation_timeout: Duration::from_secs(10),
            },
            monitoring: MonitoringConfig {
                stats_interval: Duration::from_secs(1),
                usage_threshold: 0.9,
                track_peak_usage: true,
                max_fragmentation: 0.2,
                detailed_tracking: true,
            },
        }
    }
}

impl AllocatorConfig {
    /// Create a new configuration with maximum security settings
    pub fn new_secure() -> Self {
        Self {
            security_level: SecurityLevel::Maximum,
            max_memory: 512 * 1024 * 1024, // 512MB (more conservative)
            max_allocations: 500_000,       // More conservative limit
            proof_interval: Duration::from_secs(30), // More frequent proofs
            enable_guards: true,
            proof_settings: ProofSettings {
                hash_function: "poseidon".to_string(),
                min_security_level: 256,    // Higher security level
                verify_immediately: true,
                operation_timeout: Duration::from_secs(5),
            },
            monitoring: MonitoringConfig {
                stats_interval: Duration::from_millis(500), // More frequent monitoring
                usage_threshold: 0.8,        // More conservative threshold
                track_peak_usage: true,
                max_fragmentation: 0.1,      // Stricter fragmentation limit
                detailed_tracking: true,
            },
        }
    }

    /// Validate the configuration
    pub fn validate(&self) -> Result<(), &'static str> {
        // Validate memory limits
        if self.max_memory == 0 || self.max_memory > 8 * 1024 * 1024 * 1024 {
            return Err("Invalid maximum memory configuration");
        }

        if self.max_allocations == 0 {
            return Err("Invalid maximum allocations configuration");
        }

        // Validate intervals
        if self.proof_interval.as_secs() == 0 || self.proof_interval.as_secs() > 3600 {
            return Err("Invalid proof interval configuration");
        }

        if self.monitoring.stats_interval.as_millis() == 0 {
            return Err("Invalid monitoring interval configuration");
        }

        // Validate thresholds
        if !(0.0..=1.0).contains(&self.monitoring.usage_threshold) {
            return Err("Invalid usage threshold configuration");
        }

        if !(0.0..=1.0).contains(&self.monitoring.max_fragmentation) {
            return Err("Invalid fragmentation threshold configuration");
        }

        // Validate proof settings
        if self.proof_settings.min_security_level < 128 {
            return Err("Security level too low");
        }

        if self.proof_settings.operation_timeout.as_secs() == 0 {
            return Err("Invalid proof timeout configuration");
        }

        Ok(())
    }

    /// Get recommended heap layout based on configuration
    pub fn get_heap_layout(&self) -> HeapLayout {
        HeapLayout {
            total_size: self.max_memory,
            page_size: 4096,
            min_block_size: 16,
            max_block_size: 1024 * 1024, // 1MB
            alignment: 8,
        }
    }
}

/// Heap memory layout configuration
#[derive(Debug, Clone, Copy)]
pub struct HeapLayout {
    pub total_size: usize,
    pub page_size: usize,
    pub min_block_size: usize,
    pub max_block_size: usize,
    pub alignment: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AllocatorConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_secure_config() {
        let config = AllocatorConfig::new_secure();
        assert!(config.validate().is_ok());
        assert_eq!(config.security_level, SecurityLevel::Maximum);
        assert!(config.proof_settings.min_security_level >= 256);
    }

    #[test]
    fn test_invalid_config() {
        let mut config = AllocatorConfig::default();
        
        // Test invalid memory limit
        config.max_memory = 0;
        assert!(config.validate().is_err());
        
        // Test invalid threshold
        config = AllocatorConfig::default();
        config.monitoring.usage_threshold = 1.5;
        assert!(config.validate().is_err());
        
        // Test invalid security level
        config = AllocatorConfig::default();
        config.proof_settings.min_security_level = 64;
        assert!(config.validate().is_err());
    }
} 