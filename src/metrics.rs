use prometheus::{
    core::{AtomicF64, GenericCounter, GenericGauge},
    proto::MetricFamily,
    Encoder, TextEncoder,
};
use std::sync::Arc;
use crossbeam::queue::SegQueue;
use portable_atomic::{AtomicU64, Ordering};

#[derive(Clone)]
pub struct VectorizedMetrics {
    counters: Arc<SegQueue<MetricEvent>>,
    gauge_values: [AtomicF64; 1024],
    histograms: [AtomicU64; 256],
}

impl VectorizedMetrics {
    pub fn new() -> Self {
        Self {
            counters: Arc::new(SegQueue::new()),
            gauge_values: [(); 1024].map(|_| AtomicF64::new(0.0)),
            histograms: [(); 256].map(|_| AtomicU64::new(0)),
        }
    }

    #[inline(always)]
    pub fn increment(&self, metric_id: u16, value: f64) {
        let event = MetricEvent {
            timestamp: fast_epoch(),
            metric_id,
            value,
        };
        self.counters.push(event);
    }

    #[inline(always)]
    pub fn vectorized_set(&self, values: &[f64; 8], indices: &[usize; 8]) {
        unsafe {
            use core::arch::x86_64::*;
            let vals = _mm512_loadu_pd(values.as_ptr());
            for chunk in indices.chunks_exact(8) {
                let idx = _mm512_loadu_epi64(chunk.as_ptr() as _);
                _mm512_i64scatter_pd(
                    self.gauge_values.as_ptr() as _,
                    idx,
                    vals,
                    1,
                );
            }
        }
    }

    pub fn gather(&self) -> Vec<u8> {
        let mut buffer = Vec::with_capacity(1024 * 1024);
        let encoder = TextEncoder::new();
        
        let mut count = 0;
        let mut batch = [MetricEvent::default(); 1024];
        while let Some(event) = self.counters.pop() {
            batch[count] = event;
            count += 1;
            
            if count == 1024 {
                encoder.encode(
                    &self.process_batch(&batch, count),
                    &mut buffer
                ).unwrap();
                count = 0;
            }
        }
        
        buffer
    }

    #[inline(always)]
    fn process_batch(&self, batch: &[MetricEvent], len: usize) -> Vec<MetricFamily> {
        let mut families = Vec::with_capacity(len);
        
        unsafe {
            use core::arch::x86_64::*;
            let mut histogram = [0u64; 256];
            let hist_ptr = histogram.as_mut_ptr();
            
            for event in batch.iter().take(len) {
                let idx = (event.value as u64 % 256) as i32;
                _mm512_store_epi64(
                    hist_ptr.offset(idx),
                    _mm512_add_epi64(
                        _mm512_load_epi64(hist_ptr.offset(idx)),
                        _mm512_set1_epi64(1)
                    )
                );
            }
            
            for (i, count) in histogram.iter().enumerate() {
                self.histograms[i].fetch_add(*count, Ordering::Relaxed);
            }
        }
        
        families
    }
}

#[derive(Clone, Copy, Default)]
#[repr(C, align(64))]
struct MetricEvent {
    timestamp: u64,
    metric_id: u16,
    value: f64,
}

#[inline(always)]
fn fast_epoch() -> u64 {
    unsafe { std::arch::x86_64::_rdtsc() }
}
