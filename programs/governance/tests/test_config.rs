use {
    glitch_gremlin_program::allocator::config::AllocatorConfig,
    nexus_zkvm::security::SecurityLevel,
    solana_program_test::ProgramTest,
    std::{time::Duration, sync::Arc},
};

pub struct TestConfig {
    pub allocator_config: AllocatorConfig,
    pub compute_units: u64,
    pub test_timeout: Duration,
    pub security_level: SecurityLevel,
    pub sbf_config: SbfConfig,
}

pub struct SbfConfig {
    pub max_compute_units: u64,
    pub heap_size: usize,
    pub stack_size: usize,
    pub enable_security_builtins: bool,
    pub enable_chaos_mode: bool,
    pub chaos_config: Option<ChaosConfig>,
}

impl Default for SbfConfig {
    fn default() -> Self {
        Self {
            max_compute_units: 200_000,
            heap_size: 256 * 1024, // 256KB
            stack_size: 128 * 1024, // 128KB
            enable_security_builtins: true,
            enable_chaos_mode: false,
            chaos_config: None,
        }
    }
}

impl Default for TestConfig {
    fn default() -> Self {
        Self {
            allocator_config: AllocatorConfig::new_secure(),
            compute_units: 100_000,
            test_timeout: Duration::from_secs(30),
            security_level: SecurityLevel::Maximum,
            sbf_config: SbfConfig::default(),
        }
    }
}

impl TestConfig {
    pub fn new_secure() -> Self {
        Self {
            allocator_config: AllocatorConfig {
                security_level: SecurityLevel::Maximum,
                max_memory: 256 * 1024 * 1024, // 256MB for tests
                max_allocations: 100_000,
                proof_interval: Duration::from_secs(5),
                enable_guards: true,
                proof_settings: ProofSettings {
                    verify_signatures: true,
                    check_program_ownership: true,
                    validate_account_keys: true,
                    enforce_rent_exempt: true,
                    check_account_privileges: true,
                },
                monitoring: MonitoringConfig {
                    enable_metrics: true,
                    enable_tracing: true,
                    log_level: LogLevel::Debug,
                    alert_threshold: 5,
                },
            },
            compute_units: 200_000,
            test_timeout: Duration::from_secs(60),
            security_level: SecurityLevel::Maximum,
            sbf_config: SbfConfig {
                max_compute_units: 300_000,
                heap_size: 512 * 1024, // 512KB for secure tests
                stack_size: 256 * 1024, // 256KB for secure tests
                enable_security_builtins: true,
                enable_chaos_mode: true,
                chaos_config: Some(ChaosConfig {
                    probability: 0.1,
                    max_delay_ms: 100,
                    fault_injection: true,
                    memory_corruption: false,
                    network_partition: true,
                }),
            },
        }
    }

    pub fn configure_program_test(&self, program_test: &mut ProgramTest) {
        program_test.set_compute_max_units(self.sbf_config.max_compute_units);
        
        if self.sbf_config.enable_security_builtins {
            program_test.add_program_arg("--secure-memory=true");
            program_test.add_program_arg("--memory-monitoring=true");
            program_test.add_program_arg(&format!("--heap-size={}", self.sbf_config.heap_size));
            program_test.add_program_arg(&format!("--stack-size={}", self.sbf_config.stack_size));
            program_test.add_program_arg("--enable-security-checks=true");
            program_test.add_program_arg("--enforce-aligned-access=true");
            program_test.add_program_arg("--verify-program-access=true");
        }

        if let Some(chaos_config) = &self.sbf_config.chaos_config {
            program_test.add_program_arg("--chaos-mode=true");
            program_test.add_program_arg(&format!("--chaos-probability={}", chaos_config.probability));
            program_test.add_program_arg(&format!("--max-delay-ms={}", chaos_config.max_delay_ms));
            program_test.add_program_arg(&format!("--fault-injection={}", chaos_config.fault_injection));
            program_test.add_program_arg(&format!("--memory-corruption={}", chaos_config.memory_corruption));
            program_test.add_program_arg(&format!("--network-partition={}", chaos_config.network_partition));
        }
    }

    pub fn with_security_level(mut self, level: SecurityLevel) -> Self {
        self.security_level = level;
        self.allocator_config.security_level = level;
        self
    }

    pub fn with_compute_units(mut self, units: u64) -> Self {
        self.compute_units = units;
        self.sbf_config.max_compute_units = units;
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.test_timeout = timeout;
        self
    }

    pub fn with_chaos_mode(mut self, enabled: bool) -> Self {
        self.sbf_config.enable_chaos_mode = enabled;
        self
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        // Validate compute units
        if self.compute_units == 0 || self.compute_units > 1_000_000 {
            return Err("Invalid compute units configuration");
        }

        // Validate timeout
        if self.test_timeout.as_secs() == 0 || self.test_timeout.as_secs() > 300 {
            return Err("Invalid test timeout configuration");
        }

        // Validate SBF config
        if self.sbf_config.heap_size < 32 * 1024 || self.sbf_config.heap_size > 1024 * 1024 {
            return Err("Invalid heap size configuration");
        }

        if self.sbf_config.stack_size < 32 * 1024 || self.sbf_config.stack_size > 512 * 1024 {
            return Err("Invalid stack size configuration");
        }

        // Validate allocator config
        self.allocator_config.validate()?;

        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct ChaosConfig {
    pub probability: f64,
    pub max_delay_ms: u64,
    pub fault_injection: bool,
    pub memory_corruption: bool,
    pub network_partition: bool,
}

#[derive(Debug, Clone)]
pub struct ProofSettings {
    pub verify_signatures: bool,
    pub check_program_ownership: bool,
    pub validate_account_keys: bool,
    pub enforce_rent_exempt: bool,
    pub check_account_privileges: bool,
}

#[derive(Debug, Clone)]
pub struct MonitoringConfig {
    pub enable_metrics: bool,
    pub enable_tracing: bool,
    pub log_level: LogLevel,
    pub alert_threshold: u32,
}

#[derive(Debug, Clone, Copy)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = TestConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_secure_config() {
        let config = TestConfig::new_secure();
        assert!(config.validate().is_ok());
        assert_eq!(config.security_level, SecurityLevel::Maximum);
        assert!(config.sbf_config.enable_security_builtins);
    }

    #[test]
    fn test_invalid_config() {
        let mut config = TestConfig::default();
        
        // Test invalid compute units
        config.compute_units = 0;
        assert!(config.validate().is_err());
        
        // Test invalid timeout
        config = TestConfig::default();
        config.test_timeout = Duration::from_secs(301);
        assert!(config.validate().is_err());

        // Test invalid heap size
        config = TestConfig::default();
        config.sbf_config.heap_size = 16 * 1024; // Too small
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_chaos_mode() {
        let config = TestConfig::default()
            .with_chaos_mode(true)
            .with_security_level(SecurityLevel::Maximum);
        
        let mut program_test = ProgramTest::default();
        config.configure_program_test(&mut program_test);
        
        assert!(config.sbf_config.enable_chaos_mode);
        assert_eq!(config.security_level, SecurityLevel::Maximum);
    }
} 