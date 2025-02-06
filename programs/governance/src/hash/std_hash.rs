use std::hash::{BuildHasher, Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

/// StdHasher is a wrapper around the standard library's DefaultHasher
#[derive(Debug, Clone)]
pub struct StdHasher(DefaultHasher);

impl StdHasher {
    #[inline]
    fn new() -> Self {
        StdHasher(DefaultHasher::new())
    }
}

impl Hasher for StdHasher {
    #[inline]
    fn finish(&self) -> u64 {
        self.0.finish()
    }

    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        self.0.write(bytes)
    }

    #[inline]
    fn write_u8(&mut self, i: u8) {
        self.0.write_u8(i)
    }

    #[inline]
    fn write_u32(&mut self, i: u32) {
        self.0.write_u32(i)
    }

    #[inline]
    fn write_u64(&mut self, i: u64) {
        self.0.write_u64(i)
    }
}

/// StdBuildHasher is a wrapper around the standard library's RandomState
#[derive(Clone, Default)]
pub struct StdBuildHasher;

impl StdBuildHasher {
    #[inline]
    pub fn new() -> Self {
        StdBuildHasher
    }

    #[inline]
    pub fn with_seeds(_k0: u64, _k1: u64) -> Self {
        // Seeds are ignored in standard hasher
        StdBuildHasher
    }
}

impl BuildHasher for StdBuildHasher {
    type Hasher = StdHasher;

    #[inline]
    fn build_hasher(&self) -> StdHasher {
        StdHasher::new()
    }
} 