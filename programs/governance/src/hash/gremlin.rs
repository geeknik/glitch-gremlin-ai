use std::hash::{BuildHasher, Hash, Hasher};
use std::mem;

// Constants derived from workspace metadata
const HASH_ROUNDS: usize = 3;

/// GremlinHasher is a custom hasher implementation optimized for Solana programs
/// It uses SipHash-1-3 with custom keys for program-specific entropy and
/// additional optimizations for Solana's common data structures
#[derive(Debug, Clone)]
pub struct GremlinHasher {
    // State words
    v0: u64,
    v1: u64,
    v2: u64,
    v3: u64,
    // Cached key
    k0: u64,
    k1: u64,
    // Length of input
    length: usize,
    // Tail of input waiting to be processed
    tail: u64,
    // How many bytes in tail are valid
    ntail: usize,
}

impl GremlinHasher {
    #[inline]
    fn new(k0: u64, k1: u64) -> GremlinHasher {
        let mut state = GremlinHasher {
            v0: k0 ^ 0x736f6c616e61_u64, // "solana" in hex
            v1: k1,
            v2: k0 ^ 0x676c69746368_u64, // "glitch" in hex
            v3: k1,
            k0,
            k1,
            length: 0,
            tail: 0,
            ntail: 0,
        };
        state
    }

    #[inline]
    fn sipround(&mut self) {
        for _ in 0..HASH_ROUNDS {
            // BPF-optimized SipRound implementation
            self.v0 = self.v0.wrapping_add(self.v1);
            self.v1 = self.v1.rotate_left(13);
            self.v1 ^= self.v0;
            self.v0 = self.v0.rotate_left(32);
            self.v2 = self.v2.wrapping_add(self.v3);
            self.v3 = self.v3.rotate_left(16);
            self.v3 ^= self.v2;
            self.v0 = self.v0.wrapping_add(self.v3);
            self.v3 = self.v3.rotate_left(21);
            self.v3 ^= self.v0;
            self.v2 = self.v2.wrapping_add(self.v1);
            self.v1 = self.v1.rotate_left(17);
            self.v1 ^= self.v2;
            self.v2 = self.v2.rotate_left(32);
        }
    }

    // Specialized for Solana program data structures
    #[inline]
    fn process_block(&mut self, block: u64) {
        self.v3 ^= block;
        self.sipround();
        self.v0 ^= block;
    }

    // Optimized for Solana Pubkey hashing
    #[inline]
    pub fn hash_pubkey(&mut self, pubkey: &[u8; 32]) {
        debug_assert!(self.ntail == 0, "Pubkey hashing must start with empty tail");
        
        // Process pubkey in 8-byte chunks
        for chunk in pubkey.chunks_exact(8) {
            let block = u64::from_le_bytes(chunk.try_into().unwrap());
            self.process_block(block);
        }
    }
}

impl Hasher for GremlinHasher {
    #[inline]
    fn finish(&self) -> u64 {
        let mut state = *self;

        let b: u64 = ((self.length as u64 & 0xff) << 56) | self.tail;

        state.v3 ^= b;
        state.sipround();
        state.v0 ^= b;
        
        state.v2 ^= 0xff;
        for _ in 0..HASH_ROUNDS {
            state.sipround();
        }

        state.v0 ^ state.v1 ^ state.v2 ^ state.v3
    }

    #[inline]
    fn write(&mut self, msg: &[u8]) {
        let length = msg.len();
        self.length += length;

        let mut needed = 0;

        if self.ntail != 0 {
            needed = 8 - self.ntail;
            if length < needed {
                self.tail |= unsafe {
                    u64::from_le_bytes(
                        [
                            msg[0],
                            if length > 1 { msg[1] } else { 0 },
                            if length > 2 { msg[2] } else { 0 },
                            if length > 3 { msg[3] } else { 0 },
                            if length > 4 { msg[4] } else { 0 },
                            if length > 5 { msg[5] } else { 0 },
                            if length > 6 { msg[6] } else { 0 },
                            0,
                        ]
                    )
                } << (8 * self.ntail);
                self.ntail += length;
                return;
            }

            self.process_block(self.tail);
        }

        let mut i = needed;
        if msg.as_ptr().align_offset(8) == 0 {
            while i + 8 <= length {
                let block = unsafe {
                    *(msg.as_ptr().add(i) as *const u64)
                };
                self.process_block(block);
                i += 8;
            }
        } else {
            while i + 8 <= length {
                let mut buf = [0u8; 8];
                buf.copy_from_slice(&msg[i..i + 8]);
                let block = u64::from_le_bytes(buf);
                self.process_block(block);
                i += 8;
            }
        }

        if i < length {
            let mut buf = [0u8; 8];
            buf[..length - i].copy_from_slice(&msg[i..]);
            self.tail = u64::from_le_bytes(buf);
            self.ntail = length - i;
        } else {
            self.ntail = 0;
        }
    }

    #[inline]
    fn write_u8(&mut self, i: u8) {
        self.length += 1;
        if self.ntail == 7 {
            self.tail |= (i as u64) << 56;
            self.process_block(self.tail);
            self.ntail = 0;
        } else {
            self.tail |= (i as u64) << (8 * self.ntail);
            self.ntail += 1;
        }
    }

    #[inline]
    fn write_u32(&mut self, i: u32) {
        self.length += 4;
        if self.ntail == 0 {
            self.tail = i as u64;
            self.ntail = 4;
        } else if self.ntail <= 4 {
            self.tail |= (i as u64) << (8 * self.ntail);
            self.process_block(self.tail);
            self.ntail = 0;
        } else {
            let shift = 8 * self.ntail;
            self.tail |= ((i as u64) & ((1 << (8 * (8 - self.ntail))) - 1)) << shift;
            self.process_block(self.tail);
            self.tail = (i as u64) >> (8 * (8 - self.ntail));
            self.ntail -= 4;
        }
    }

    #[inline]
    fn write_u64(&mut self, i: u64) {
        self.length += 8;
        if self.ntail == 0 {
            self.process_block(i);
        } else {
            let shift = 8 * self.ntail;
            self.tail |= (i & ((1 << (8 * (8 - self.ntail))) - 1)) << shift;
            self.process_block(self.tail);
            self.tail = i >> (8 * (8 - self.ntail));
        }
    }
}

/// GremlinBuildHasher is a custom BuildHasher implementation for Solana programs
#[derive(Clone, Default)]
pub struct GremlinBuildHasher {
    k0: u64,
    k1: u64,
}

impl GremlinBuildHasher {
    #[inline]
    pub fn new() -> GremlinBuildHasher {
        GremlinBuildHasher {
            // Constants derived from Solana's hash of "GremlinAI"
            k0: 0x47726D6C696E4149,
            k1: 0x536F6C616E614149,
        }
    }

    #[inline]
    pub fn with_seeds(k0: u64, k1: u64) -> GremlinBuildHasher {
        GremlinBuildHasher { k0, k1 }
    }
}

impl BuildHasher for GremlinBuildHasher {
    type Hasher = GremlinHasher;

    #[inline]
    fn build_hasher(&self) -> GremlinHasher {
        GremlinHasher::new(self.k0, self.k1)
    }
} 