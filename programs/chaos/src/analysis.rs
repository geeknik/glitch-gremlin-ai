use packed_simd::u64x4;
use solana_program::keccak;

pub struct ResultAnalyzer {
    threat_patterns: [u64x4; 4],
}

impl ResultAnalyzer {
    pub fn detect_anomalies(&self, results: &[TestResult]) -> Vec<SecurityEvent> {
        results.par_windows(4)
            .flat_map(|chunk| {
                let hashes = chunk.iter()
                    .map(|r| self.vectorized_hash(r))
                    .collect::<Vec<_>>();
                
                self.simd_pattern_match(hashes)
            })
            .collect()
    }

    #[inline(always)]
    fn vectorized_hash(&self, result: &TestResult) -> u64x4 {
        let bytes = result.as_bytes();
        let hash = keccak::hashv(&[bytes]);
        u64x4::from_slice_unaligned(hash.as_ref())
    }

    #[inline(always)]
    fn simd_pattern_match(&self, hashes: Vec<u64x4>) -> Vec<SecurityEvent> {
        hashes.into_par_iter()
            .filter(|&h| (h & self.threat_patterns[h.extract(0) as usize % 4]).any())
            .map(|_| SecurityEvent::new(ThreatLevel::High))
            .collect()
    }
}
