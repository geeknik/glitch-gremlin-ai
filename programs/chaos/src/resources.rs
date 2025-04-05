use std::sync::atomic::{AtomicU64, Ordering};

pub struct ResourcePool {
    available_cpu: AtomicU64,
    available_mem: AtomicU64,
    max_cpu: u64,
    max_mem: u64,
}

impl ResourcePool {
    pub fn acquire(&self, req: ResourceProfile) -> Result<(), ResourceError> {
        let mut current_cpu = self.available_cpu.load(Ordering::Relaxed);
        let mut current_mem = self.available_mem.load(Ordering::Relaxed);
        
        loop {
            if current_cpu < req.cpu || current_mem < req.mem {
                return Err(ResourceError::InsufficientCapacity);
            }
            
            match self.available_cpu.compare_exchange_weak(
                current_cpu,
                current_cpu - req.cpu,
                Ordering::AcqRel,
                Ordering::Relaxed
            ) {
                Ok(_) => {
                    self.available_mem.fetch_sub(req.mem, Ordering::AcqRel);
                    return Ok(());
                }
                Err(actual) => current_cpu = actual,
            }
        }
    }

    pub fn release(&self, req: ResourceProfile) {
        self.available_cpu.fetch_add(req.cpu, Ordering::Release);
        self.available_mem.fetch_add(req.mem, Ordering::Release);
    }
}
