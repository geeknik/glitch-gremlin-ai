use std::hash::{BuildHasher, Hash, Hasher};
use std::mem;

mod sbf;
pub use sbf::{SBFHasher, SBFBuildHasher};

/// Convenience function to hash a value using the selected hasher implementation
#[inline]
pub fn hash<T: Hash>(value: &T) -> u64 {
    let mut hasher = SBFBuildHasher::new().build_hasher();
    value.hash(&mut hasher);
    hasher.finish()
}

// Re-export collections that use our hasher
mod collections;
pub use collections::GremlinMap;

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn test_basic_hashing() {
        let value = "test";
        let hash1 = hash(&value);
        let hash2 = hash(&value);
        assert_eq!(hash1, hash2, "Same input should produce same hash");
    }

    #[test]
    fn test_different_inputs() {
        let hash1 = hash(&"test1");
        let hash2 = hash(&"test2");
        assert_ne!(hash1, hash2, "Different inputs should produce different hashes");
    }

    #[test]
    fn test_with_pubkey() {
        let pubkey = Pubkey::new_unique();
        let hash = hash(&pubkey);
        assert_ne!(hash, 0, "Pubkey should produce non-zero hash");
    }

    #[test]
    fn test_distribution() {
        let mut counts = vec![0; 256];
        for i in 0..10000 {
            let hash = hash(&i);
            let bucket = (hash % 256) as usize;
            counts[bucket] += 1;
        }
        
        // Check distribution is roughly uniform
        let mean = counts.iter().sum::<i32>() as f64 / counts.len() as f64;
        let variance: f64 = counts.iter()
            .map(|&x| {
                let diff = x as f64 - mean;
                diff * diff
            })
            .sum::<f64>() / counts.len() as f64;
        let std_dev = variance.sqrt();
        
        // Standard deviation should be less than 20% of mean for good distribution
        assert!(std_dev < mean * 0.2, "Hash distribution is not uniform enough");
    }

    #[test]
    fn test_avalanche_effect() {
        let input1 = "test string";
        let input2 = "test strinh"; // One bit difference
        
        let hash1 = hash(&input1);
        let hash2 = hash(&input2);
        
        let diff_bits = (hash1 ^ hash2).count_ones();
        
        // Good hash functions should have about 32 bits different (half of 64)
        assert!(diff_bits > 25, "Avalanche effect is too weak");
    }
} 