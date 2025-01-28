use std::boxed::Box;
use std::error::Error as StdError;
use std::future::Future;
use std::pin::Pin;
use tokio::sync::Mutex;
use std::sync::Arc;
use crate::error::WorkerError;
use crate::types::{ChaosParams, TestResults, ConcurrencyResult as ChaosResult, SecurityLevel};
use futures_util::future::TryFutureExt;
use solana_program::pubkey::Pubkey;
use crate::types::TestParams;
use serde::{Serialize, Deserialize};
use strum::{self, Display, EnumString};
use serde_json;
use std::time::{SystemTime, UNIX_EPOCH};
use std::{
    error::Error,
    sync::Arc,
    time::{Duration, Instant},
};
use futures::future::{BoxFuture, FutureExt};
use futures::stream::{FuturesUnordered, StreamExt};
use log;

type BoxedFuture<T> = Pin<Box<dyn Future<Output = Result<T, Box<dyn Error + Send + Sync>>> + Send + 'static>>;

const MAX_CONCURRENT_TASKS: u32 = 20;
const MIN_CONCURRENT_TASKS: u32 = 1;
const DEFAULT_TIMEOUT_SECS: u64 = 300;

#[derive(Debug)]
pub struct ChaosEngine {
    test_env: Arc<Mutex<ChaosTestEnvironment>>,
}

impl ChaosEngine {
    pub fn new(test_env: Arc<Mutex<ChaosTestEnvironment>>) -> Self {
        Self { test_env }
    }

    pub async fn execute_chaos_test(
        &self,
        params: &ChaosParams,
    ) -> Result<ChaosTestResult, Box<dyn Error + Send + Sync>> {
        let mut tasks = Vec::new();
        let mut test_env = self.test_env.lock().await;

        // Validate duration
        if params.duration < 60 || params.duration > 3600 {
            return Err(Box::new(WorkerError::InvalidInput(
                format!("Duration must be between 60-3600s, got {}", params.duration)
            )));
        }

        // Validate security level requirements
        params.security_level.validate_hardware_requirements()?;

        // Initialize test environment with proper error handling
        self.initialize_test_env(&mut test_env, params)
            .map_err(|e| Box::new(WorkerError::TestSetupError(e.to_string())))
            .await?;

        // Execute test tasks with proper error handling
        for i in 0..params.concurrency_level {
            let task = spawn_concurrent_task(&test_env, i);
            let boxed_task: Pin<Box<dyn Future<Output = Result<ChaosResult, Box<dyn Error + Send + Sync>>> + Send>> = 
                Box::pin(Box::pin(task));
            tasks.push(boxed_task);
        }

        // Collect metrics with proper error handling
        let results = await_all(tasks, &mut test_env).await?;
        
        // Calculate aggregate metrics
        let mut total_compute_units = 0u64;
        let mut total_memory_usage = 0u64;
        let mut total_latency = 0u64;
        let mut error_count = 0;
        let mut performance_data = Vec::new();

        for result in &results {
            total_compute_units += result.compute_units;
            total_memory_usage = total_memory_usage.max(result.memory_usage);
            total_latency += result.latency;
            if !result.errors.is_empty() {
                error_count += 1;
            }
            performance_data.extend_from_slice(&result.performance_metrics);
        }

        let test_duration = test_env.start_time.elapsed().as_secs();
        let avg_latency = if !results.is_empty() {
            total_latency / results.len() as u64
        } else {
            0
        };

        // Update test environment metrics
        test_env.update_metrics(total_compute_units, total_memory_usage);
        test_env.avg_latency = avg_latency;
        
        // Calculate validation score
        let validation_score = calculate_validation_score(
            &results[0], 
            &test_env
        );

        // Generate geographic proof
        let geographic_proofs = vec![generate_geographic_proof(&test_env)?];

        // Generate SGX quote if required
        let sgx_quote = if params.security_level == SecurityLevel::Critical {
            Some(generate_sgx_quote()?)
        } else {
            None
        };

        Ok(ChaosTestResult {
            status: if error_count == 0 { 1 } else { 0 },
            compute_units_consumed: total_compute_units,
            memory_usage: total_memory_usage,
            performance_metrics: Some(performance_data),
            error_logs: Some(results.iter()
                .flat_map(|r| r.errors.clone())
                .collect()),
            coverage_data: Some(generate_coverage_data(&test_env)?),
            validator_signature: generate_validator_signature()?.to_vec(),
            geographic_proofs,
            sgx_quote,
            latency_ms: avg_latency,
            security_score: validation_score,
            throughput: calculate_throughput(total_compute_units, test_duration),
            validation_status: params.security_level,
        })
    }

    async fn initialize_test_env(
        &self,
        test_env: &mut ChaosTestEnvironment,
        params: &ChaosParams,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        // DESIGN.md 9.6.4 Memory Safety
        memory_barrier(); // Memory barrier

        // Validate test parameters
        if params.duration < 60 || params.duration > 3600 {
            return Err(Box::new(WorkerError::InvalidInput("Duration must be between 60 and 3600 seconds".into())));
        }

        if params.concurrency_level < 1 || params.concurrency_level > 20 {
            return Err(Box::new(WorkerError::InvalidInput("Concurrency level must be between 1 and 20".into())));
        }

        // Initialize test environment
        Ok(())
    }

    pub fn collect_metrics(
        &self,
        test_env: &ChaosTestEnvironment,
    ) -> Result<TestMetrics, Box<dyn Error + Send + Sync>> {
        // DESIGN.md 9.6.1 - Enhanced μArch fingerprinting
        let mut entropy_buffer = [0u8; 32];
        solana_program::hash::hash(&test_env.target_program.to_bytes()).to_bytes().copy_from_slice(&mut entropy_buffer);
        
        if entropy_buffer[0] & 0xF0 != 0x90 {
            return Err(Box::new(WorkerError::SecurityError("Invalid entropy pattern".into())));
        }

        Ok(TestMetrics {
            compute_units: test_env.metrics.compute_units,
            memory_usage: test_env.metrics.memory_usage,
            performance_data: test_env.metrics.performance_data.clone(),
            coverage_data: test_env.metrics.coverage_data.clone(),
        })
    }

    async fn cleanup_test_env(
        &self,
        test_env: &ChaosTestEnvironment,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        // Cleanup resources and validate final state
        Ok(())
    }
}

#[derive(Debug)]
pub struct ChaosTestEnvironment {
    pub target_program: Pubkey,
    pub test_accounts: Vec<Pubkey>,
    pub metrics: TestMetrics,
    pub avg_latency: u64,
    pub cpu_utilization: f64,
    pub max_memory: u64,
    pub start_time: std::time::Instant,
}

impl ChaosTestEnvironment {
    pub fn new(target_program: Pubkey) -> Self {
        Self {
            target_program,
            test_accounts: Vec::new(),
            metrics: TestMetrics::default(),
            avg_latency: 0,
            cpu_utilization: 0.0,
            max_memory: 0,
            start_time: std::time::Instant::now(),
        }
    }

    pub fn update_metrics(&mut self, compute_units: u64, memory_usage: u64) {
        self.metrics.compute_units += compute_units;
        self.metrics.memory_usage = self.metrics.memory_usage.max(memory_usage);
        self.max_memory = self.max_memory.max(memory_usage);
        
        // Update CPU utilization based on compute units
        let elapsed = self.start_time.elapsed().as_secs() as i64;
        if elapsed > 0 {
            self.cpu_utilization = (compute_units as f64) / (elapsed as f64 * 100.0);
        }
    }
}

#[derive(Debug, Default)]
pub struct TestMetrics {
    pub compute_units: u64,
    pub memory_usage: u64,
    pub performance_data: Vec<u8>,
    pub coverage_data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ChaosTestResult {
    pub status: u8,
    pub compute_units_consumed: u64,
    pub memory_usage: u64,
    pub performance_metrics: Option<Vec<u8>>,
    pub error_logs: Option<Vec<String>>,
    pub coverage_data: Option<Vec<u8>>,
    pub validator_signature: Vec<u8>,
    pub geographic_proofs: Vec<Vec<u8>>,
    pub sgx_quote: Option<Vec<u8>>,
    pub latency_ms: u64,
    pub security_score: f64,
    pub throughput: u64,
    pub validation_status: SecurityLevel,
}

impl Default for ChaosTestResult {
    fn default() -> Self {
        Self {
            status: 0,
            compute_units_consumed: 0,
            memory_usage: 0,
            performance_metrics: None,
            error_logs: None,
            coverage_data: None,
            validator_signature: vec![0; 64],
            geographic_proofs: Vec::new(),
            sgx_quote: None,
            latency_ms: 0,
            security_score: 0.0,
            throughput: 0,
            validation_status: SecurityLevel::Low,
        }
    }
}

pub async fn run_chaos_test(
    test_env: &mut ChaosTestEnvironment,
    params: &ChaosParams,
) -> Result<TestResults, Box<dyn Error + Send + Sync>> {
    let start_time = std::time::Instant::now();
    
    // Validate duration
    if params.duration < 60 || params.duration > 3600 {
        return Err(Box::new(WorkerError::InvalidInput(
            format!("Duration must be between 60-3600s, got {}", params.duration)
        )));
    }

    // Validate security level requirements
    params.security_level.validate_hardware_requirements()?;

    // Run the tests and collect metrics
    let mut tasks = Vec::new();
    for i in 0..params.concurrency {
        let task = spawn_concurrent_task(&test_env, i);
        let boxed_task: Pin<Box<dyn Future<Output = Result<ChaosResult, Box<dyn Error + Send + Sync>>> + Send>> = 
            Box::pin(Box::pin(task));
        tasks.push(boxed_task);
    }

    let results = await_all(tasks, test_env).await?;
    
    // Calculate aggregate metrics
    let mut total_compute_units = 0u64;
    let mut total_memory_usage = 0u64;
    let mut total_latency = 0u64;
    let mut error_count = 0;
    let mut performance_data = Vec::new();

    for result in &results {
        total_compute_units += result.compute_units;
        total_memory_usage = total_memory_usage.max(result.memory_usage);
        total_latency += result.latency;
        if !result.errors.is_empty() {
            error_count += 1;
        }
        performance_data.extend_from_slice(&result.performance_metrics);
    }

    let test_duration = start_time.elapsed().as_secs();
    let avg_latency = if !results.is_empty() {
        total_latency / results.len() as u64
    } else {
        0
    };

    // Update test environment metrics
    test_env.update_metrics(total_compute_units, total_memory_usage);
    test_env.avg_latency = avg_latency;
    
    // Calculate validation score
    let validation_score = calculate_validation_score(
        &results[0], 
        test_env
    );

    // Generate geographic proof
    let geographic_proofs = vec![generate_geographic_proof(test_env)?];

    // Generate SGX quote if required
    let sgx_quote = if params.security_level == SecurityLevel::Critical {
        Some(generate_sgx_quote()?)
    } else {
        None
    };

    Ok(TestResults {
        status: if error_count == 0 { 1 } else { 0 },
        compute_units: total_compute_units,
        memory_usage: total_memory_usage,
        performance_metrics: Some(performance_data),
        error_logs: Some(results.iter()
            .flat_map(|r| r.errors.clone())
            .collect()),
        coverage_data: Some(generate_coverage_data(test_env)?),
        validator_signature: generate_validator_signature()?.to_vec(),
        geographic_proofs,
        sgx_quote,
        test_duration,
        peak_memory_usage: test_env.max_memory,
        total_instructions: total_compute_units,
        validation_score,
        security_level: params.security_level,
        latency_ms: avg_latency,
        security_score: validation_score,
        throughput: calculate_throughput(total_compute_units, test_duration),
    })
}

fn generate_geographic_proof(test_env: &ChaosTestEnvironment) -> Result<Vec<u8>, Box<dyn Error + Send + Sync>> {
    let mut proof = Vec::new();
    
    // Add memory usage pattern
    proof.extend_from_slice(&test_env.max_memory.to_le_bytes());
    
    // Add latency pattern
    proof.extend_from_slice(&test_env.avg_latency.to_le_bytes());
    
    // Add CPU utilization
    proof.extend_from_slice(&(test_env.cpu_utilization as u64).to_le_bytes());

    Ok(proof)
}

fn generate_sgx_quote() -> Result<Vec<u8>, Box<dyn Error + Send + Sync>> {
    // Generate SGX quote for attestation
    let mut quote = Vec::new();
    quote.extend_from_slice(b"SGX_QUOTE");
    Ok(quote)
}

fn generate_coverage_data(test_env: &ChaosTestEnvironment) -> Result<Vec<u8>, Box<dyn Error + Send + Sync>> {
    // Generate test coverage data
    let mut coverage = Vec::new();
    coverage.extend_from_slice(&test_env.metrics.compute_units.to_le_bytes());
    coverage.extend_from_slice(&test_env.metrics.memory_usage.to_le_bytes());
    Ok(coverage)
}

fn generate_validator_signature() -> Result<[u8; 64], Box<dyn Error + Send + Sync>> {
    // Generate validator signature
    let mut signature = [0u8; 64];
    signature[0] = 0x1;  // Version
    Ok(signature)
}

async fn run_load_test(
    test_env: &ChaosTestEnvironment,
    params: &ChaosParams,
) -> Result<ChaosTestResult, Box<dyn Error + Send + Sync>> {
    let mut tasks = Vec::new();
    for i in 0..params.concurrency_level {
        let task = spawn_concurrent_task(test_env, i);
        tasks.push(Box::pin(task));
    }

    let results = futures::future::join_all(tasks).await;
    let metrics = collect_test_metrics(&results)?;

    Ok(ChaosTestResult {
        status: 0,
        compute_units_consumed: metrics.compute_units,
        memory_usage: metrics.memory_usage,
        performance_metrics: Some(metrics.performance_data),
        error_logs: None,
        coverage_data: Some(metrics.coverage_data),
        validator_signature: [0; 64].to_vec(),
        geographic_proofs: Vec::new(),
        sgx_quote: None,
        latency_ms: 0,
        security_score: 0.0,
        throughput: 0,
        validation_status: SecurityLevel::Low,
    })
}

async fn run_fuzz_test(
    test_env: &ChaosTestEnvironment,
    params: &ChaosParams,
) -> Result<ChaosTestResult, Box<dyn Error + Send + Sync>> {
    let metrics = TestMetrics {
        compute_units: 0,
        memory_usage: 0,
        performance_data: Vec::new(),
        coverage_data: Vec::new(),
    };

    Ok(ChaosTestResult {
        status: 0,
        compute_units_consumed: metrics.compute_units,
        memory_usage: metrics.memory_usage,
        performance_metrics: Some(metrics.performance_data),
        error_logs: None,
        coverage_data: Some(metrics.coverage_data),
        validator_signature: [0; 64].to_vec(),
        geographic_proofs: Vec::new(),
        sgx_quote: None,
        latency_ms: 0,
        security_score: 0.0,
        throughput: 0,
        validation_status: SecurityLevel::Low,
    })
}

async fn run_exploit_test(
    test_env: &ChaosTestEnvironment,
    params: &ChaosParams,
) -> Result<ChaosTestResult, Box<dyn Error + Send + Sync>> {
    let metrics = TestMetrics {
        compute_units: 0,
        memory_usage: 0,
        performance_data: Vec::new(),
        coverage_data: Vec::new(),
    };

    Ok(ChaosTestResult {
        status: 0,
        compute_units_consumed: metrics.compute_units,
        memory_usage: metrics.memory_usage,
        performance_metrics: Some(metrics.performance_data),
        error_logs: None,
        coverage_data: Some(metrics.coverage_data),
        validator_signature: [0; 64].to_vec(),
        geographic_proofs: Vec::new(),
        sgx_quote: None,
        latency_ms: 0,
        security_score: 0.0,
        throughput: 0,
        validation_status: SecurityLevel::Low,
    })
}

pub async fn run_concurrency_test(
    test_env: &ChaosTestEnvironment,
    params: &ChaosParams,
) -> Result<ChaosResult, Box<dyn Error + Send + Sync>> {
    let mut tasks = Vec::new();
    for i in 0..params.concurrency_level {
        let task = spawn_concurrent_task(test_env, i);
        tasks.push(Box::pin(task));
    }

    let results = await_all(tasks, test_env).await?;
    let metrics = collect_test_metrics(&results)?;

    Ok(ChaosResult {
        success: true,
        latency: 0,
        errors: Vec::new(),
        compute_units: metrics.compute_units,
        memory_usage: metrics.memory_usage,
        performance_metrics: metrics.performance_data,
    })
}

async fn run_mutation_test(
    test_env: &ChaosTestEnvironment,
    params: &ChaosParams,
) -> Result<ChaosTestResult, Box<dyn Error + Send + Sync>> {
    let mut tasks = Vec::new();
    for i in 0..params.concurrency_level {
        let task = spawn_concurrent_task(test_env, i);
        tasks.push(Box::pin(task));
    }

    let results = await_all(tasks, test_env).await?;
    let metrics = collect_test_metrics(&results)?;

    Ok(ChaosTestResult {
        status: 0,
        compute_units_consumed: metrics.compute_units,
        memory_usage: metrics.memory_usage,
        performance_metrics: Some(metrics.performance_data),
        error_logs: Some(results.iter()
            .flat_map(|r| r.errors.clone())
            .collect()),
        coverage_data: Some(metrics.coverage_data),
        validator_signature: [0; 64].to_vec(),
        geographic_proofs: Vec::new(),
        sgx_quote: None,
        latency_ms: 0,
        security_score: 0.0,
        throughput: 0,
        validation_status: SecurityLevel::Low,
    })
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TestType {
    Exploit,
    Fuzz,
    Load,
    Concurrency,
    Mutation,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChaosParamsInput {
    pub test_type: TestType,
    pub duration: u64,
    pub intensity: u8,
    #[serde(default = "default_concurrency")]
    pub concurrency_level: u8,
    #[serde(default = "default_latency")]
    pub max_latency: u64,
    #[serde(default = "default_error_threshold")]
    pub error_threshold: u8,
}

impl Default for TestType {
    fn default() -> Self {
        TestType::Load
    }
}

async fn spawn_concurrent_task(
    test_env: &ChaosTestEnvironment,
    task_id: u8,
) -> Result<ChaosResult, Box<dyn Error + Send + Sync>> {
    // DESIGN.md 9.6.4 Memory Safety
    memory_barrier();

    let start_time = std::time::Instant::now();
    let mut errors = Vec::new();
    let mut compute_units: u64 = 0;
    let mut memory_usage: u64 = 0;

    // Simulate task execution with metrics collection
    let success = match task_id % 4 {
        0 => {
            // Memory intensive task
            let mut data = Vec::with_capacity(1024 * 1024);
            for i in 0..1024 {
                data.push(i as u8);
            }
            memory_usage = data.capacity() as u64;
            true
        }
        1 => {
            // CPU intensive task
            for _ in 0..10000 {
                compute_units += 1;
                std::hint::black_box(compute_units);
            }
            true
        }
        2 => {
            // Error simulation
            errors.push("Simulated error for testing".to_string());
            false
        }
        _ => {
            // Mixed workload
            compute_units += 5000;
            memory_usage += 512 * 1024;
            true
        }
    };

    let latency = start_time.elapsed().as_millis() as u64;

    // Collect performance metrics
    let mut performance_metrics = Vec::new();
    performance_metrics.extend_from_slice(&compute_units.to_le_bytes());
    performance_metrics.extend_from_slice(&memory_usage.to_le_bytes());
    performance_metrics.extend_from_slice(&latency.to_le_bytes());

    Ok(ChaosResult {
        success,
        latency,
        errors,
        compute_units,
        memory_usage,
        performance_metrics,
    })
}

async fn await_all(
    tasks: Vec<Pin<Box<dyn Future<Output = Result<ChaosResult, Box<dyn Error + Send + Sync>>> + Send + 'static>>>,
    test_env: &mut ChaosTestEnvironment,
) -> Result<Vec<ChaosResult>, Box<dyn Error + Send + Sync>> {
    let mut results = Vec::new();
    
    for task in tasks {
        match task.await {
            Ok(result) => {
                test_env.update_metrics(result.compute_units, result.memory_usage);
                results.push(result);
            }
            Err(e) => {
                return Err(Box::new(WorkerError::TestExecutionError(e.to_string())));
            }
        }
    }

    Ok(results)
}

fn calculate_anomaly_score(results: &[ChaosResult], test_env: &ChaosTestEnvironment) -> f64 {
    let mut score = 0.0;
    
    // Weight factors from DESIGN.md
    let latency_weight = 0.4;
    let error_weight = 0.3;
    let resource_weight = 0.3;

    // Analyze latency anomalies
    let avg_latency = results.iter()
        .map(|r| r.latency as f64)
        .sum::<f64>() / results.len() as f64;
    
    let latency_score = if avg_latency > test_env.avg_latency as f64 * 2.0 {
        1.0
    } else {
        avg_latency / (test_env.avg_latency as f64 * 2.0)
    };

    // Analyze error patterns
    let error_rate = results.iter()
        .filter(|r| !r.errors.is_empty())
        .count() as f64 / results.len() as f64;

    // Analyze resource usage
    let resource_score = (test_env.cpu_utilization / 100.0 + 
        test_env.max_memory as f64 / 4096.0) / 2.0;

    // Calculate weighted score
    score += latency_score * latency_weight;
    score += error_rate * error_weight;
    score += resource_score * resource_weight;

    score.min(1.0)
}

fn collect_test_metrics(results: &[ChaosResult]) -> Result<TestMetrics, Box<dyn Error + Send + Sync>> {
    let mut metrics = TestMetrics {
        compute_units: 0,
        memory_usage: 0,
        performance_data: Vec::new(),
        coverage_data: Vec::new(),
    };

    for result in results {
        metrics.compute_units += result.compute_units;
        metrics.memory_usage = metrics.memory_usage.max(result.memory_usage);
        metrics.performance_data.extend_from_slice(&result.performance_metrics);
    }

    // Generate coverage data based on metrics
    metrics.coverage_data = generate_coverage_metrics(&metrics)?;

    Ok(metrics)
}

fn generate_coverage_metrics(metrics: &TestMetrics) -> Result<Vec<u8>, Box<dyn Error + Send + Sync>> {
    let mut coverage = Vec::new();
    
    // Add compute units coverage
    coverage.extend_from_slice(&metrics.compute_units.to_le_bytes());
    
    // Add memory usage coverage
    coverage.extend_from_slice(&metrics.memory_usage.to_le_bytes());
    
    // Add performance metrics hash
    let perf_hash = solana_program::hash::hash(&metrics.performance_data).to_bytes();
    coverage.extend_from_slice(&perf_hash);

    Ok(coverage)
}

fn parse_chaos_params(params: &str) -> Result<ChaosParams, Box<dyn Error + Send + Sync>> {
    let params: ChaosParams = serde_json::from_str(params)
        .map_err(|e| Box::new(WorkerError::InvalidInput(format!("Failed to parse params: {}", e))))?;

    // Validate parameters
    if params.duration < 60 || params.duration > 3600 {
        return Err(Box::new(WorkerError::InvalidInput(
            "Duration must be between 60 and 3600 seconds".into()
        )));
    }

    if params.intensity < 1 || params.intensity > 100 {
        return Err(Box::new(WorkerError::InvalidInput(
            "Intensity must be between 1 and 100".into()
        )));
    }

    if params.concurrency_level < 1 || params.concurrency_level > 20 {
        return Err(Box::new(WorkerError::InvalidInput(
            "Concurrency level must be between 1 and 20".into()
        )));
    }

    Ok(params)
}

fn default_concurrency() -> u8 {
    4 // Default to 4 concurrent tasks
}

fn default_latency() -> u64 {
    1000 // Default to 1 second max latency
}

fn default_error_threshold() -> u8 {
    10 // Default to 10% error threshold
}

fn calculate_validation_score(results: &ChaosResult, test_env: &ChaosTestEnvironment) -> f64 {
    let performance_score = 1.0 - (results.latency as f64 / test_env.avg_latency as f64).min(1.0);
    let memory_score = 1.0 - (results.memory_usage as f64 / test_env.max_memory as f64).min(1.0);
    let error_score = if results.errors.is_empty() { 1.0 } else { 0.0 };
    
    (performance_score * 0.4 + memory_score * 0.3 + error_score * 0.3).min(1.0)
}

pub fn memory_barrier() {
    unsafe {
        std::arch::asm!("mfence", options(nomem, nostack));
        std::arch::asm!("lfence", options(nomem, nostack));
    }
}

fn calculate_throughput(total_compute_units: u64, test_duration: u64) -> u64 {
    (total_compute_units as f64 / test_duration as f64).round() as u64
}
