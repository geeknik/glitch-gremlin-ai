use {
    crate::error::GovernanceError,
    anchor_lang::prelude::*,
    chrono::{DateTime, Utc},
    circular_buffer::CircularBuffer,
    metrics::{counter, gauge, histogram},
    std::sync::Arc,
    tokio::sync::RwLock,
    time_series_generator::{Generator, TimePoint},
};

pub const METRICS_BUFFER_SIZE: usize = 1000;
pub const METRICS_RETENTION_HOURS: i64 = 24;

#[derive(Debug, Clone)]
pub struct MetricsPoint {
    pub timestamp: DateTime<Utc>,
    pub total_stake: u64,
    pub active_proposals: u32,
    pub total_votes: u64,
    pub unique_voters: u32,
    pub treasury_balance: u64,
    pub chaos_events: u32,
    pub avg_voting_power: f64,
    pub quorum_percentage: f64,
}

#[derive(Debug)]
pub struct MetricsCollector {
    buffer: Arc<RwLock<CircularBuffer<MetricsPoint>>>,
    generator: Generator,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(RwLock::new(CircularBuffer::new(METRICS_BUFFER_SIZE))),
            generator: Generator::new(),
        }
    }

    pub async fn record_metrics(&self, point: MetricsPoint) -> Result<(), GovernanceError> {
        // Record individual metrics
        gauge!("governance.total_stake", point.total_stake as f64);
        gauge!("governance.active_proposals", point.active_proposals as f64);
        counter!("governance.total_votes", point.total_votes as i64);
        gauge!("governance.unique_voters", point.unique_voters as f64);
        gauge!("governance.treasury_balance", point.treasury_balance as f64);
        counter!("governance.chaos_events", point.chaos_events as i64);
        gauge!("governance.avg_voting_power", point.avg_voting_power);
        gauge!("governance.quorum_percentage", point.quorum_percentage);

        // Store in circular buffer
        let mut buffer = self.buffer.write().await;
        buffer.push(point);

        Ok(())
    }

    pub async fn get_metrics_history(&self, hours: i64) -> Vec<MetricsPoint> {
        let buffer = self.buffer.read().await;
        let now = Utc::now();
        buffer
            .iter()
            .filter(|point| {
                (now - point.timestamp).num_hours() <= hours
            })
            .cloned()
            .collect()
    }

    pub async fn generate_forecast(&self, points: &[MetricsPoint], horizon_hours: i64) -> Vec<TimePoint> {
        // Convert metrics points to time series
        let series: Vec<TimePoint> = points
            .iter()
            .map(|p| TimePoint {
                timestamp: p.timestamp.timestamp(),
                value: p.total_stake as f64,
            })
            .collect();

        // Generate forecast
        self.generator.forecast(&series, horizon_hours)
    }

    pub fn calculate_volatility(&self, points: &[MetricsPoint]) -> f64 {
        if points.is_empty() {
            return 0.0;
        }

        let values: Vec<f64> = points.iter()
            .map(|p| p.total_stake as f64)
            .collect();

        let mean = values.iter().sum::<f64>() / values.len() as f64;
        let variance = values.iter()
            .map(|v| (v - mean).powi(2))
            .sum::<f64>() / values.len() as f64;

        variance.sqrt()
    }

    pub async fn detect_anomalies(&self, window_size: usize) -> Vec<MetricsPoint> {
        let buffer = self.buffer.read().await;
        let points: Vec<MetricsPoint> = buffer.iter().cloned().collect();
        
        if points.len() < window_size {
            return vec![];
        }

        let mut anomalies = vec![];
        let mut window = CircularBuffer::new(window_size);

        for point in points.iter() {
            if window.is_full() {
                let mean = window.iter()
                    .map(|p: &MetricsPoint| p.total_stake as f64)
                    .sum::<f64>() / window_size as f64;

                let std_dev = (window.iter()
                    .map(|p| ((p.total_stake as f64) - mean).powi(2))
                    .sum::<f64>() / window_size as f64)
                    .sqrt();

                let current_value = point.total_stake as f64;
                if (current_value - mean).abs() > 2.0 * std_dev {
                    anomalies.push(point.clone());
                }
            }
            window.push(point.clone());
        }

        anomalies
    }

    pub async fn export_prometheus(&self) -> String {
        metrics_exporter_prometheus::PrometheusBuilder::new()
            .add_global_label("service", "governance")
            .build()
            .expect("Failed to create Prometheus exporter")
            .render()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_metrics_collection() {
        let collector = MetricsCollector::new();
        let point = MetricsPoint {
            timestamp: Utc::now(),
            total_stake: 1000,
            active_proposals: 5,
            total_votes: 100,
            unique_voters: 50,
            treasury_balance: 5000,
            chaos_events: 2,
            avg_voting_power: 20.0,
            quorum_percentage: 0.4,
        };

        collector.record_metrics(point.clone()).await.unwrap();
        let history = collector.get_metrics_history(1).await;
        assert!(!history.is_empty());
    }

    #[tokio::test]
    async fn test_anomaly_detection() {
        let collector = MetricsCollector::new();
        let normal_value = 1000;
        let anomaly_value = 10000;

        // Add normal points
        for _ in 0..10 {
            let point = MetricsPoint {
                timestamp: Utc::now(),
                total_stake: normal_value,
                active_proposals: 5,
                total_votes: 100,
                unique_voters: 50,
                treasury_balance: 5000,
                chaos_events: 2,
                avg_voting_power: 20.0,
                quorum_percentage: 0.4,
            };
            collector.record_metrics(point).await.unwrap();
        }

        // Add anomaly
        let anomaly_point = MetricsPoint {
            timestamp: Utc::now(),
            total_stake: anomaly_value,
            active_proposals: 5,
            total_votes: 100,
            unique_voters: 50,
            treasury_balance: 5000,
            chaos_events: 2,
            avg_voting_power: 20.0,
            quorum_percentage: 0.4,
        };
        collector.record_metrics(anomaly_point).await.unwrap();

        let anomalies = collector.detect_anomalies(5).await;
        assert!(!anomalies.is_empty());
    }
} 