pub mod config;
pub mod monitor;
pub mod memory;

use {
    self::{
        config::AllocatorConfig,
        monitor::{AllocatorMonitor, MonitoringStats},
        memory::{SecureMemoryPool, SecureMemoryBlock},
    },
    nexus_zkvm::{
        runtime::Runtime as NexusRuntime,
        security::{SecurityLevel, MemoryGuard},
        allocator::{AllocatorConfig as NexusConfig, MemoryStats},
    },
    std::{
        sync::Arc,
        cell::UnsafeCell,
        alloc::{GlobalAlloc, Layout},
        ptr::NonNull,
        sync::atomic::{AtomicUsize, Ordering},
    },
    tokio::sync::RwLock,
};

/// Secure memory allocator with zero-knowledge proofs and runtime monitoring
pub struct GremlinSecureAllocator {
    // Nexus zkVM runtime for proof generation
    nexus_runtime: Arc<NexusRuntime>,
    
    // Memory pool for secure allocations
    memory_pool: UnsafeCell<SecureMemoryPool>,
    
    // Memory statistics and monitoring
    stats: UnsafeCell<MemoryStats>,
    
    // Security configuration
    security_level: SecurityLevel,
    
    // Memory tracking
    total_allocated: AtomicUsize,
    total_deallocated: AtomicUsize,
    peak_usage: AtomicUsize,
    allocation_count: AtomicUsize,
    
    // Memory guards for secure regions
    secure_regions: Vec<MemoryGuard>,
}

unsafe impl Send for GremlinSecureAllocator {}
unsafe impl Sync for GremlinSecureAllocator {}

impl GremlinSecureAllocator {
    /// Create a new secure allocator with the specified security level
    pub const fn new(security_level: SecurityLevel) -> Self {
        let config = AllocatorConfig::new_secure();
        
        Self {
            nexus_runtime: Arc::new(NexusRuntime::new().expect("Failed to initialize Nexus runtime")),
            memory_pool: UnsafeCell::new(SecureMemoryPool::new(config.clone())),
            stats: UnsafeCell::new(MemoryStats::default()),
            security_level,
            total_allocated: AtomicUsize::new(0),
            total_deallocated: AtomicUsize::new(0),
            peak_usage: AtomicUsize::new(0),
            allocation_count: AtomicUsize::new(0),
            secure_regions: Vec::new(),
        }
    }

    /// Get current memory statistics
    pub fn get_stats(&self) -> MemoryStats {
        unsafe { *self.stats.get() }
    }

    /// Generate zero-knowledge proof of memory safety
    pub fn prove_memory_safety(&self) -> Result<Vec<u8>, &'static str> {
        let current_stats = self.get_stats();
        
        // Generate proof of current memory state
        let proof = self.nexus_runtime.prove_with_params(
            "memory_safety",
            current_stats,
            self.generate_witness()?,
            ProofParams {
                security_level: self.security_level as u8,
                hash_function: "poseidon".to_string(),
                verification_key: None,
            },
        ).map_err(|_| "Failed to generate proof")?;

        Ok(proof.to_bytes())
    }

    /// Generate witness for memory safety proof
    fn generate_witness(&self) -> Result<Vec<u8>, &'static str> {
        let mut witness = Vec::new();
        
        // Add memory statistics
        witness.extend_from_slice(&self.total_allocated.load(Ordering::SeqCst).to_le_bytes());
        witness.extend_from_slice(&self.total_deallocated.load(Ordering::SeqCst).to_le_bytes());
        witness.extend_from_slice(&self.peak_usage.load(Ordering::SeqCst).to_le_bytes());
        witness.extend_from_slice(&self.allocation_count.load(Ordering::SeqCst).to_le_bytes());

        // Add secure region hashes
        for region in &self.secure_regions {
            witness.extend_from_slice(&region.compute_hash());
        }

        Ok(witness)
    }

    /// Verify memory safety proof
    pub fn verify_memory_safety(&self, proof: &[u8]) -> Result<bool, &'static str> {
        self.nexus_runtime.verify_proof(
            "memory_safety",
            proof,
            &ProofParams::default(),
        ).map_err(|_| "Failed to verify proof")
    }
}

unsafe impl GlobalAlloc for GremlinSecureAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        // Get memory pool
        let pool = &mut *self.memory_pool.get();
        
        // Allocate memory with security checks
        match pool.allocate(layout) {
            Ok(ptr) => {
                // Update statistics
                self.total_allocated.fetch_add(layout.size(), Ordering::SeqCst);
                self.allocation_count.fetch_add(1, Ordering::SeqCst);
                
                let current_usage = self.total_allocated.load(Ordering::SeqCst) 
                    - self.total_deallocated.load(Ordering::SeqCst);
                    
                self.peak_usage.fetch_max(current_usage, Ordering::SeqCst);

                ptr.as_ptr()
            },
            Err(_) => std::ptr::null_mut(),
        }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // Get memory pool
        let pool = &mut *self.memory_pool.get();
        
        // Deallocate memory
        if let Ok(()) = pool.deallocate(NonNull::new_unchecked(ptr), layout) {
            // Update statistics
            self.total_deallocated.fetch_add(layout.size(), Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_allocation() {
        let allocator = GremlinSecureAllocator::new(SecurityLevel::Maximum);
        
        // Allocate memory
        let layout = Layout::from_size_align(1024, 8).unwrap();
        let ptr = unsafe { allocator.alloc(layout) };
        assert!(!ptr.is_null());

        // Verify statistics
        let stats = allocator.get_stats();
        assert_eq!(stats.total_allocated, 1024);
        assert_eq!(stats.allocation_count, 1);

        // Generate and verify proof
        let proof = allocator.prove_memory_safety().unwrap();
        assert!(allocator.verify_memory_safety(&proof).unwrap());

        // Deallocate memory
        unsafe { allocator.dealloc(ptr, layout) };
        
        // Verify updated statistics
        let stats = allocator.get_stats();
        assert_eq!(stats.total_deallocated, 1024);
    }

    #[test]
    fn test_memory_safety_violations() {
        let allocator = GremlinSecureAllocator::new(SecurityLevel::Maximum);
        
        // Test invalid alignment
        let invalid_layout = Layout::from_size_align(16, 4097).unwrap();
        let ptr = unsafe { allocator.alloc(invalid_layout) };
        assert!(ptr.is_null());

        // Test excessive size
        let huge_layout = Layout::from_size_align(isize::MAX as usize + 1, 8).unwrap();
        let ptr = unsafe { allocator.alloc(huge_layout) };
        assert!(ptr.is_null());
    }
} 