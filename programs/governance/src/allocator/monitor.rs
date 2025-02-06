use {
    super::{
        config::{AllocatorConfig, MonitoringConfig},
        GremlinSecureAllocator,
    },
    nexus_zkvm::{
        security::{SecurityLevel, Alert, AlertSeverity},
        monitoring::{MetricsCollector, ResourceUsage},
    },
    std::{
        sync::{Arc, atomic::{AtomicBool, Ordering}},
        time::{Duration, Instant},
        collections::HashMap,
    },
    tokio::sync::RwLock,
};

/// Memory allocation event types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AllocationEvent {
    Allocate(usize),
    Deallocate(usize),
    ProofGenerated,
    ProofVerified,
    GuardViolation,
    ThresholdExceeded,
}

/// Memory monitoring statistics
#[derive(Debug, Clone)]
pub struct MonitoringStats {
    pub total_allocations: usize,
    pub total_deallocations: usize,
    pub current_usage: usize,
    pub peak_usage: usize,
    pub proof_generations: usize,
    pub proof_verifications: usize,
    pub guard_violations: usize,
    pub threshold_violations: usize,
    pub fragmentation_ratio: f64,
    pub last_proof_duration: Duration,
    pub allocation_sizes: HashMap<usize, usize>,
}

impl Default for MonitoringStats {
    fn default() -> Self {
        Self {
            total_allocations: 0,
            total_deallocations: 0,
            current_usage: 0,
            peak_usage: 0,
            proof_generations: 0,
            proof_verifications: 0,
            guard_violations: 0,
            threshold_violations: 0,
            fragmentation_ratio: 0.0,
            last_proof_duration: Duration::default(),
            allocation_sizes: HashMap::new(),
        }
    }
}

/// Memory monitor for the secure allocator
pub struct AllocatorMonitor {
    // Configuration
    config: Arc<AllocatorConfig>,
    
    // Statistics
    stats: RwLock<MonitoringStats>,
    
    // Metrics collector
    metrics: MetricsCollector,
    
    // Alert status
    alert_active: AtomicBool,
    
    // Last monitoring time
    last_check: RwLock<Instant>,
}

impl AllocatorMonitor {
    /// Create a new allocator monitor
    pub fn new(config: Arc<AllocatorConfig>) -> Self {
        Self {
            config,
            stats: RwLock::new(MonitoringStats::default()),
            metrics: MetricsCollector::new("gremlin_allocator"),
            alert_active: AtomicBool::new(false),
            last_check: RwLock::new(Instant::now()),
        }
    }

    /// Record an allocation event
    pub async fn record_event(&self, event: AllocationEvent, size: Option<usize>) {
        let mut stats = self.stats.write().await;
        
        match event {
            AllocationEvent::Allocate(s) => {
                stats.total_allocations += 1;
                stats.current_usage += s;
                stats.peak_usage = stats.peak_usage.max(stats.current_usage);
                
                if let Some(size) = size {
                    *stats.allocation_sizes.entry(size).or_insert(0) += 1;
                }
                
                // Check memory thresholds
                if (stats.current_usage as f64) / (self.config.max_memory as f64) 
                    > self.config.monitoring.usage_threshold {
                    stats.threshold_violations += 1;
                    self.alert_active.store(true, Ordering::SeqCst);
                    self.emit_alert(
                        AlertSeverity::High,
                        "Memory usage threshold exceeded",
                        stats.current_usage,
                    ).await;
                }
            },
            AllocationEvent::Deallocate(s) => {
                stats.total_deallocations += 1;
                stats.current_usage = stats.current_usage.saturating_sub(s);
                
                // Update fragmentation ratio
                if stats.current_usage > 0 {
                    let total_allocated: usize = stats.allocation_sizes.values().sum();
                    stats.fragmentation_ratio = 1.0 - (stats.current_usage as f64 
                        / total_allocated as f64);
                        
                    if stats.fragmentation_ratio > self.config.monitoring.max_fragmentation {
                        self.emit_alert(
                            AlertSeverity::Medium,
                            "High memory fragmentation detected",
                            stats.fragmentation_ratio,
                        ).await;
                    }
                }
            },
            AllocationEvent::ProofGenerated => {
                stats.proof_generations += 1;
            },
            AllocationEvent::ProofVerified => {
                stats.proof_verifications += 1;
            },
            AllocationEvent::GuardViolation => {
                stats.guard_violations += 1;
                self.alert_active.store(true, Ordering::SeqCst);
                self.emit_alert(
                    AlertSeverity::Critical,
                    "Memory guard violation detected",
                    stats.guard_violations,
                ).await;
            },
            AllocationEvent::ThresholdExceeded => {
                stats.threshold_violations += 1;
            },
        }

        // Update metrics
        self.metrics.record_gauge("current_usage", stats.current_usage as f64);
        self.metrics.record_gauge("peak_usage", stats.peak_usage as f64);
        self.metrics.record_gauge("fragmentation", stats.fragmentation_ratio);
    }

    /// Check memory safety and generate alerts if needed
    pub async fn check_memory_safety(&self, allocator: &GremlinSecureAllocator) -> Result<(), &'static str> {
        let now = Instant::now();
        let mut last_check = self.last_check.write().await;
        
        // Check if it's time for monitoring
        if now.duration_since(*last_check) < self.config.monitoring.stats_interval {
            return Ok(());
        }
        
        *last_check = now;
        
        // Generate and verify memory safety proof
        let proof_start = Instant::now();
        let proof = allocator.prove_memory_safety()?;
        
        if allocator.verify_memory_safety(&proof)? {
            let mut stats = self.stats.write().await;
            stats.last_proof_duration = proof_start.elapsed();
            self.record_event(AllocationEvent::ProofVerified, None).await;
        } else {
            self.emit_alert(
                AlertSeverity::Critical,
                "Memory safety proof verification failed",
                0,
            ).await;
            return Err("Memory safety verification failed");
        }

        Ok(())
    }

    /// Get current monitoring statistics
    pub async fn get_stats(&self) -> MonitoringStats {
        self.stats.read().await.clone()
    }

    /// Check if any alerts are active
    pub fn has_active_alerts(&self) -> bool {
        self.alert_active.load(Ordering::SeqCst)
    }

    /// Emit a security alert
    async fn emit_alert(&self, severity: AlertSeverity, message: &str, value: impl std::fmt::Display) {
        let alert = Alert {
            severity,
            message: format!("{}: {}", message, value),
            timestamp: std::time::SystemTime::now(),
            source: "GremlinSecureAllocator".to_string(),
        };

        // Record alert metric
        self.metrics.record_counter("alerts_total", 1.0);
        self.metrics.record_counter(
            &format!("alerts_{}", severity.to_string().to_lowercase()),
            1.0,
        );

        // Log alert
        match severity {
            AlertSeverity::Critical => error!("CRITICAL ALERT: {}", alert.message),
            AlertSeverity::High => warn!("HIGH ALERT: {}", alert.message),
            AlertSeverity::Medium => warn!("MEDIUM ALERT: {}", alert.message),
            AlertSeverity::Low => info!("LOW ALERT: {}", alert.message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_monitor_allocation_events() {
        let config = Arc::new(AllocatorConfig::new_secure());
        let monitor = AllocatorMonitor::new(config);

        // Test allocation
        monitor.record_event(AllocationEvent::Allocate(1024), Some(1024)).await;
        let stats = monitor.get_stats().await;
        assert_eq!(stats.total_allocations, 1);
        assert_eq!(stats.current_usage, 1024);

        // Test deallocation
        monitor.record_event(AllocationEvent::Deallocate(1024), None).await;
        let stats = monitor.get_stats().await;
        assert_eq!(stats.total_deallocations, 1);
        assert_eq!(stats.current_usage, 0);
    }

    #[tokio::test]
    async fn test_monitor_threshold_violations() {
        let mut config = AllocatorConfig::new_secure();
        config.monitoring.usage_threshold = 0.5;
        let config = Arc::new(config);
        let monitor = AllocatorMonitor::new(config.clone());

        // Allocate memory above threshold
        let allocation_size = (config.max_memory as f64 * 0.6) as usize;
        monitor.record_event(AllocationEvent::Allocate(allocation_size), Some(allocation_size)).await;

        let stats = monitor.get_stats().await;
        assert_eq!(stats.threshold_violations, 1);
        assert!(monitor.has_active_alerts());
    }

    #[tokio::test]
    async fn test_monitor_guard_violations() {
        let config = Arc::new(AllocatorConfig::new_secure());
        let monitor = AllocatorMonitor::new(config);

        monitor.record_event(AllocationEvent::GuardViolation, None).await;
        
        let stats = monitor.get_stats().await;
        assert_eq!(stats.guard_violations, 1);
        assert!(monitor.has_active_alerts());
    }
} 