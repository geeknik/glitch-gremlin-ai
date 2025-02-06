use std::hash::{BuildHasher, Hash, Hasher};

/// SBFHasher is a custom hasher implementation optimized for Solana SBF programs
/// It uses a simplified SipHash variant that's compatible with SBF constraints
#[derive(Debug)]
pub struct SBFHasher {
    state: u64,
    length: u64,
}

impl SBFHasher {
    #[inline]
    fn new() -> SBFHasher {
        SBFHasher {
            state: 0,
            length: 0,
        }
    }
}

impl Hasher for SBFHasher {
    #[inline]
    fn finish(&self) -> u64 {
        self.state
    }

    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.state = self.state.wrapping_mul(31).wrapping_add(*byte as u64);
            self.length += 1;
        }
    }
}

/// SBFBuildHasher is a custom BuildHasher implementation for Solana SBF programs
#[derive(Clone, Default)]
pub struct SBFBuildHasher;

impl SBFBuildHasher {
    #[inline]
    pub fn new() -> SBFBuildHasher {
        SBFBuildHasher
    }
}

impl BuildHasher for SBFBuildHasher {
    type Hasher = SBFHasher;

    #[inline]
    fn build_hasher(&self) -> SBFHasher {
        SBFHasher::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_hash() {
        let mut hasher = SBFHasher::new();
        hasher.write(b"hello");
        assert_ne!(hasher.finish(), 0);
    }

    #[test]
    fn test_different_inputs() {
        let mut hasher = SBFHasher::new();
        hasher.write(b"hello");
        let hash1 = hasher.finish();

        let mut hasher = SBFHasher::new();
        hasher.write(b"world");
        let hash2 = hasher.finish();

        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_build_hasher() {
        let builder = SBFBuildHasher::new();
        let mut hasher = builder.build_hasher();
        hasher.write(b"test");
        assert_ne!(hasher.finish(), 0);
    }

    #[test]
    fn test_consistency() {
        let mut hasher1 = SBFHasher::new();
        hasher1.write(b"test");
        let hash1 = hasher1.finish();

        let mut hasher2 = SBFHasher::new();
        hasher2.write(b"test");
        let hash2 = hasher2.finish();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_zero_input() {
        let mut hasher = SBFHasher::new();
        hasher.write(&[]);
        assert_eq!(hasher.finish(), 0);
    }
} 