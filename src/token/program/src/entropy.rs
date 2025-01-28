use solana_program::{clock::Clock, program_error::ProgramError, sysvar::Sysvar};
use sha3::{Digest, Keccak256};
use crate::error::GlitchError;

pub struct EntropyValidator {
    // Sliding window of recent entropy measurements
    window_size: usize,
    entropy_history: Vec<f64>,
    // Chi-square test parameters
    degrees_of_freedom: u32,
    confidence_level: f64,
}

impl EntropyValidator {
    pub fn new(window_size: usize) -> Self {
        Self {
            window_size,
            entropy_history: Vec::with_capacity(window_size),
            degrees_of_freedom: 255, // For byte-level analysis
            confidence_level: 0.001, // p < 0.001 as per DESIGN.md
        }
    }

    pub fn validate_entropy(&mut self, data: &[u8]) -> Result<bool, GlitchError> {
        // Calculate byte frequency distribution
        let mut frequencies = [0u32; 256];
        for &byte in data {
            frequencies[byte as usize] += 1;
        }

        // Calculate Shannon entropy
        let data_len = data.len() as f64;
        let shannon_entropy: f64 = frequencies.iter()
            .filter(|&&count| count > 0)
            .map(|&count| {
                let probability = count as f64 / data_len;
                -probability * probability.log2()
            })
            .sum();

        // Update entropy history
        if self.entropy_history.len() >= self.window_size {
            self.entropy_history.remove(0);
        }
        self.entropy_history.push(shannon_entropy);

        // Perform Chi-square test
        let chi_square = self.calculate_chi_square(&frequencies, data_len);
        
        // Critical value for p < 0.001 with 255 degrees of freedom
        let critical_value = 352.62; // Precomputed for efficiency

        // Check for anomalies in entropy pattern
        if !self.validate_entropy_pattern()? {
            return Ok(false);
        }

        // Perform additional entropy tests
        self.validate_entropy_distribution(&frequencies, data_len)?;
        
        // Generate entropy fingerprint using Keccak-256
        let fingerprint = self.generate_entropy_fingerprint(data);
        
        // Final validation combining all checks
        Ok(chi_square <= critical_value 
           && shannon_entropy > 7.0 
           && self.validate_fingerprint(&fingerprint))
    }

    fn calculate_chi_square(&self, frequencies: &[u32; 256], total: f64) -> f64 {
        let expected = total / 256.0;
        frequencies.iter()
            .map(|&observed| {
                let diff = observed as f64 - expected;
                diff * diff / expected
            })
            .sum()
    }

    fn validate_entropy_pattern(&self) -> Result<bool, GlitchError> {
        if self.entropy_history.len() < 2 {
            return Ok(true);
        }

        // Detect suspicious patterns in entropy history
        let entropy_variance = self.calculate_entropy_variance();
        if entropy_variance < 0.01 {
            // Too consistent - possibly synthetic data
            return Err(GlitchError::InvalidEntropyPattern);
        }

        // Check for monotonic patterns that might indicate manipulation
        let monotonic_count = self.entropy_history.windows(2)
            .filter(|w| w[0] < w[1])
            .count();

        if monotonic_count as f64 / (self.entropy_history.len() - 1) as f64 > 0.95 {
            return Err(GlitchError::SuspiciousEntropyPattern);
        }

        Ok(true)
    }

    fn validate_entropy_distribution(&self, frequencies: &[u32; 256], total: f64) -> Result<(), GlitchError> {
        // Kolmogorov-Smirnov test for uniformity
        let mut cumulative = 0.0;
        let mut max_deviation = 0.0;

        for &freq in frequencies {
            cumulative += freq as f64 / total;
            let expected = cumulative / 256.0;
            max_deviation = max_deviation.max((cumulative - expected).abs());
        }

        // K-S critical value for p < 0.001
        if max_deviation > 1.949 * (total.sqrt().recip()) {
            return Err(GlitchError::NonUniformDistribution);
        }

        Ok(())
    }

    fn generate_entropy_fingerprint(&self, data: &[u8]) -> [u8; 32] {
        let mut hasher = Keccak256::new();
        hasher.update(data);
        hasher.finalize().into()
    }

    fn validate_fingerprint(&self, fingerprint: &[u8; 32]) -> bool {
        // DESIGN.md 9.6.1 - μArch fingerprinting validation
        let clock = match Clock::get() {
            Ok(clock) => clock,
            Err(_) => return false,
        };

        // Check SGX prefix as per processor.rs
        if fingerprint[0..4] != SGX_PREFIX {
            return false;
        }

        // Validate cache timing patterns from job_processor.rs
        let timing_data = self.measure_cpu_timing();
        if self.detect_virtualization(&timing_data) {
            return false;
        }

        // Entropy pattern validation from governance.rs
        if fingerprint[0] & 0xF0 != 0x90 {
            return false;
        }

        // Chi-square test for randomness
        let chi_square = self.calculate_chi_square_for_fingerprint(fingerprint);
        if chi_square > 352.62 { // Critical value from earlier implementation
            return false;
        }

        // Validate temporal consistency
        if !self.validate_temporal_pattern(fingerprint, clock.unix_timestamp) {
            return false;
        }

        true
    }

    fn measure_cpu_timing() -> Vec<u8> {
        // Reference: job_processor.rs
        let mut timing = Vec::with_capacity(32);
        let start = std::time::Instant::now();
        
        // CPU timing measurement with memory fence
        unsafe {
            std::arch::asm!("mfence");
            std::arch::asm!("lfence");
        }
        
        for _ in 0..1000 {
            std::hint::black_box(1 + 1);
        }
        
        let duration = start.elapsed();
        timing.extend_from_slice(&duration.as_nanos().to_le_bytes());
        timing.resize(32, 0);
        timing
    }

    fn validate_temporal_pattern(&self, fingerprint: &[u8; 32], timestamp: i64) -> bool {
        // Ensure fingerprint changes predictably over time
        let temporal_hash = {
            let mut hasher = Keccak256::new();
            hasher.update(fingerprint);
            hasher.update(timestamp.to_le_bytes());
            hasher.finalize()
        };

        // Check temporal consistency with previous measurements
        if let Some(last_hash) = self.entropy_history.last() {
            let diff_count = temporal_hash.iter()
                .zip(last_hash.iter())
                .filter(|(&a, &b)| a != b)
                .count();

            // Require reasonable bit difference (Hamming distance)
            if diff_count < 96 || diff_count > 160 {
                return false;
            }
        }

        true
    }

    fn calculate_chi_square_for_fingerprint(&self, fingerprint: &[u8; 32]) -> f64 {
        let mut frequencies = [0u32; 256];
        for &byte in fingerprint.iter() {
            frequencies[byte as usize] += 1;
        }

        let expected = 32.0 / 256.0;
        frequencies.iter()
            .map(|&observed| {
                let diff = observed as f64 - expected;
                diff * diff / expected
            })
            .sum()
    }

    fn calculate_entropy_variance(&self) -> f64 {
        if self.entropy_history.is_empty() {
            return 0.0;
        }

        let mean = self.entropy_history.iter().sum::<f64>() / self.entropy_history.len() as f64;
        self.entropy_history.iter()
            .map(|&x| (x - mean) * (x - mean))
            .sum::<f64>() / self.entropy_history.len() as f64
    }
} 