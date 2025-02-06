use {
    super::config::AllocatorConfig,
    nexus_zkvm::{
        security::{SecurityLevel, MemoryGuard},
        memory::{MemoryMap, Protection},
    },
    std::{
        alloc::Layout,
        ptr::NonNull,
        sync::atomic::{AtomicUsize, Ordering},
    },
};

/// Secure memory block with guard pages and encryption
pub struct SecureMemoryBlock {
    ptr: NonNull<u8>,
    layout: Layout,
    guard: MemoryGuard,
    is_encrypted: bool,
}

impl SecureMemoryBlock {
    /// Create a new secure memory block
    pub fn new(layout: Layout, security_level: SecurityLevel) -> Result<Self, &'static str> {
        // Validate layout
        if layout.align() > 4096 || layout.size() > isize::MAX as usize {
            return Err("Invalid memory layout");
        }

        // Allocate memory with guard pages
        let mut map = MemoryMap::new(
            layout.size(),
            Protection::READ_WRITE,
        ).map_err(|_| "Failed to allocate memory")?;

        // Add guard pages
        map.add_guard_pages(4096).map_err(|_| "Failed to add guard pages")?;

        // Create memory guard
        let guard = MemoryGuard::new(
            NonNull::new(map.as_mut_ptr()).ok_or("Failed to get pointer")?,
            layout.size(),
            security_level,
        ).map_err(|_| "Failed to create memory guard")?;

        Ok(Self {
            ptr: NonNull::new(map.as_mut_ptr()).ok_or("Failed to get pointer")?,
            layout,
            guard,
            is_encrypted: false,
        })
    }

    /// Encrypt the memory block
    pub fn encrypt(&mut self) -> Result<(), &'static str> {
        if self.is_encrypted {
            return Ok(());
        }

        // Generate encryption key using Nexus zkVM
        let key = self.guard.generate_encryption_key()?;
        
        // Encrypt memory contents
        unsafe {
            self.guard.encrypt_memory(
                self.ptr.as_ptr(),
                self.layout.size(),
                &key,
            )?;
        }

        self.is_encrypted = true;
        Ok(())
    }

    /// Decrypt the memory block
    pub fn decrypt(&mut self) -> Result<(), &'static str> {
        if !self.is_encrypted {
            return Ok(());
        }

        // Get encryption key
        let key = self.guard.get_encryption_key()?;
        
        // Decrypt memory contents
        unsafe {
            self.guard.decrypt_memory(
                self.ptr.as_ptr(),
                self.layout.size(),
                &key,
            )?;
        }

        self.is_encrypted = false;
        Ok(())
    }

    /// Get pointer to memory block
    pub fn as_ptr(&self) -> *mut u8 {
        self.ptr.as_ptr()
    }

    /// Get memory layout
    pub fn layout(&self) -> Layout {
        self.layout
    }

    /// Check if memory block is encrypted
    pub fn is_encrypted(&self) -> bool {
        self.is_encrypted
    }

    /// Verify memory integrity
    pub fn verify_integrity(&self) -> Result<bool, &'static str> {
        self.guard.verify_integrity()
    }
}

impl Drop for SecureMemoryBlock {
    fn drop(&mut self) {
        // Ensure memory is wiped before deallocation
        unsafe {
            self.guard.secure_wipe(
                self.ptr.as_ptr(),
                self.layout.size(),
            ).expect("Failed to wipe memory");
        }
    }
}

/// Memory pool for secure allocations
pub struct SecureMemoryPool {
    // Memory blocks organized by size classes
    blocks: Vec<Vec<SecureMemoryBlock>>,
    
    // Statistics
    total_allocated: AtomicUsize,
    total_blocks: AtomicUsize,
    
    // Configuration
    config: AllocatorConfig,
}

impl SecureMemoryPool {
    /// Create a new secure memory pool
    pub fn new(config: AllocatorConfig) -> Self {
        // Initialize size classes (16, 32, 64, 128, 256, 512, 1024, 2048, 4096)
        let mut blocks = Vec::new();
        for _ in 0..9 {
            blocks.push(Vec::new());
        }

        Self {
            blocks,
            total_allocated: AtomicUsize::new(0),
            total_blocks: AtomicUsize::new(0),
            config,
        }
    }

    /// Allocate memory from pool
    pub fn allocate(&mut self, layout: Layout) -> Result<NonNull<u8>, &'static str> {
        // Find appropriate size class
        let size_class = self.get_size_class(layout.size());
        
        // Check if we have a free block
        if let Some(block) = self.blocks[size_class].pop() {
            // Decrypt block if needed
            let mut block = block;
            block.decrypt()?;
            
            return Ok(NonNull::new(block.as_ptr()).ok_or("Invalid pointer")?);
        }

        // Allocate new block
        let block = SecureMemoryBlock::new(layout, self.config.security_level)?;
        let ptr = block.as_ptr();
        
        // Update statistics
        self.total_allocated.fetch_add(layout.size(), Ordering::SeqCst);
        self.total_blocks.fetch_add(1, Ordering::SeqCst);
        
        // Store block for reuse
        self.blocks[size_class].push(block);
        
        Ok(NonNull::new(ptr).ok_or("Invalid pointer")?)
    }

    /// Deallocate memory back to pool
    pub fn deallocate(&mut self, ptr: NonNull<u8>, layout: Layout) -> Result<(), &'static str> {
        let size_class = self.get_size_class(layout.size());
        
        // Find and remove block
        if let Some(idx) = self.blocks[size_class]
            .iter()
            .position(|block| block.as_ptr() == ptr.as_ptr()) {
            let mut block = self.blocks[size_class].remove(idx);
            
            // Encrypt block before storing
            block.encrypt()?;
            
            // Update statistics
            self.total_allocated.fetch_sub(layout.size(), Ordering::SeqCst);
            
            // Store block for reuse
            self.blocks[size_class].push(block);
        }

        Ok(())
    }

    /// Get size class index for given size
    fn get_size_class(&self, size: usize) -> usize {
        match size {
            0..=16 => 0,
            17..=32 => 1,
            33..=64 => 2,
            65..=128 => 3,
            129..=256 => 4,
            257..=512 => 5,
            513..=1024 => 6,
            1025..=2048 => 7,
            _ => 8,
        }
    }

    /// Get current statistics
    pub fn get_stats(&self) -> PoolStats {
        PoolStats {
            total_allocated: self.total_allocated.load(Ordering::SeqCst),
            total_blocks: self.total_blocks.load(Ordering::SeqCst),
            size_class_counts: self.blocks.iter().map(|v| v.len()).collect(),
        }
    }
}

/// Memory pool statistics
#[derive(Debug, Clone)]
pub struct PoolStats {
    pub total_allocated: usize,
    pub total_blocks: usize,
    pub size_class_counts: Vec<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_memory_block() {
        let layout = Layout::from_size_align(1024, 8).unwrap();
        let mut block = SecureMemoryBlock::new(layout, SecurityLevel::Maximum).unwrap();
        
        // Test encryption
        assert!(!block.is_encrypted());
        block.encrypt().unwrap();
        assert!(block.is_encrypted());
        
        // Test decryption
        block.decrypt().unwrap();
        assert!(!block.is_encrypted());
        
        // Test integrity
        assert!(block.verify_integrity().unwrap());
    }

    #[test]
    fn test_secure_memory_pool() {
        let config = AllocatorConfig::new_secure();
        let mut pool = SecureMemoryPool::new(config);
        
        // Test allocation
        let layout = Layout::from_size_align(1024, 8).unwrap();
        let ptr = pool.allocate(layout).unwrap();
        
        // Test stats
        let stats = pool.get_stats();
        assert_eq!(stats.total_allocated, 1024);
        assert_eq!(stats.total_blocks, 1);
        
        // Test deallocation
        pool.deallocate(ptr, layout).unwrap();
        
        let stats = pool.get_stats();
        assert_eq!(stats.total_allocated, 0);
    }
} 