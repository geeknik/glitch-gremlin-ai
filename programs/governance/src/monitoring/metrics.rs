use {
    crate::error::GovernanceError,
    anchor_lang::prelude::*,
    chrono::{DateTime, Utc},
    circular_buffer::CircularBuffer,
    metrics::{counter, gauge, histogram},
    std::sync::Arc,
    tokio::sync::RwLock,
    super::forecasting::{TimeSeriesForecaster, ExponentialSmoothingParams, ForecastResult},
    time_series_generator::{Generator, TimePoint},
    statrs::statistics::{Data, Distribution, Mean, StandardDeviation},
    linreg::{linear_regression, linear_regression_of},
    moving_average::{MovingAverage, SimpleMovingAverage},
    seasonal::{decompose, Decomposition},
    exponential_smoothing::{SingleExponential, DoubleExponential, TripleExponential},
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
    forecaster: TimeSeriesForecaster,
}

#[derive(Debug, Clone)]
pub struct TimeSeriesAnalysis {
    pub trend: Vec<f64>,
    pub seasonal: Vec<f64>,
    pub residual: Vec<f64>,
    pub forecast: Vec<f64>,
    pub confidence_interval: (Vec<f64>, Vec<f64>),  // (lower, upper)
    pub anomaly_scores: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct TrendAnalysis {
    pub slope: f64,
    pub intercept: f64,
    pub r_squared: f64,
    pub prediction_interval: f64,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(RwLock::new(CircularBuffer::new(METRICS_BUFFER_SIZE))),
            forecaster: TimeSeriesForecaster::new(),
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

    pub async fn forecast_metrics(
        &mut self,
        horizon: usize,
    ) -> Result<ForecastResult, GovernanceError> {
        let buffer = self.buffer.read().await;
        let points: Vec<f64> = buffer.iter()
            .map(|p| p.total_stake as f64)
            .collect();

        if points.len() < 48 { // Need at least 2 days of data
            return Err(GovernanceError::InvalidMetrics);
        }

        let params = ExponentialSmoothingParams::default();
        self.forecaster.ensemble_forecast(&points, horizon, &params)
    }

    pub async fn analyze_volatility(
        &mut self,
        window_hours: i64,
    ) -> Result<f64, GovernanceError> {
        let history = self.get_metrics_history(window_hours).await;
        let points: Vec<f64> = history.iter()
            .map(|p| p.total_stake as f64)
            .collect();

        if points.is_empty() {
            return Err(GovernanceError::InvalidMetrics);
        }

        Ok(self.forecaster.calculate_volatility(&points))
    }

    pub async fn detect_anomalies(
        &mut self,
        window_size: usize,
    ) -> Result<Vec<MetricsPoint>, GovernanceError> {
        let buffer = self.buffer.read().await;
        let points: Vec<MetricsPoint> = buffer.iter().cloned().collect();
        
        if points.len() < window_size {
            return Ok(vec![]);
        }

        let values: Vec<f64> = points.iter()
            .map(|p| p.total_stake as f64)
            .collect();

        let mut anomalies = vec![];
        let mut window = CircularBuffer::new(window_size);

        for (i, point) in points.iter().enumerate() {
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
                    
                    // Record anomaly in Prometheus metrics
                    counter!("governance.anomalies_detected", 1);
                    gauge!("governance.anomaly_deviation", (current_value - mean).abs());
                }
            }
            window.push(point.clone());
        }

        Ok(anomalies)
    }

    pub async fn export_prometheus(&self) -> String {
        metrics_exporter_prometheus::PrometheusBuilder::new()
            .add_global_label("service", "governance")
            .build()
            .expect("Failed to create Prometheus exporter")
            .render()
    }

    pub async fn analyze_time_series(&self, points: &[MetricsPoint]) -> Result<TimeSeriesAnalysis, GovernanceError> {
        let values: Vec<f64> = points.iter()
            .map(|p| p.total_stake as f64)
            .collect();

        // Perform seasonal decomposition
        let decomp = decompose(&values, 24, true) // 24-hour seasonality
            .map_err(|_| GovernanceError::InvalidMetrics)?;

        // Calculate confidence intervals
        let std_dev = values.std_dev();
        let mean = values.mean();
        let confidence_interval = values.iter()
            .map(|_| {
                let lower = mean - 1.96 * std_dev;
                let upper = mean + 1.96 * std_dev;
                (lower, upper)
            })
            .unzip();

        // Detect anomalies using Z-score
        let anomaly_scores = values.iter()
            .map(|v| (v - mean).abs() / std_dev)
            .collect();

        // Generate forecast using triple exponential smoothing
        let mut tes = TripleExponential::new(0.7, 0.2, 0.1, 24)
            .map_err(|_| GovernanceError::InvalidMetrics)?;
        let forecast = tes.fit(&values)
            .map_err(|_| GovernanceError::InvalidMetrics)?
            .forecast(24)
            .map_err(|_| GovernanceError::InvalidMetrics)?;

        Ok(TimeSeriesAnalysis {
            trend: decomp.trend,
            seasonal: decomp.seasonal,
            residual: decomp.residual,
            forecast,
            confidence_interval,
            anomaly_scores,
        })
    }

    pub async fn analyze_trend(&self, points: &[MetricsPoint]) -> Result<TrendAnalysis, GovernanceError> {
        let x: Vec<f64> = (0..points.len()).map(|i| i as f64).collect();
        let y: Vec<f64> = points.iter().map(|p| p.total_stake as f64).collect();

        let (slope, intercept) = linear_regression(&x, &y)
            .map_err(|_| GovernanceError::InvalidMetrics)?;

        // Calculate R-squared
        let y_mean = y.iter().sum::<f64>() / y.len() as f64;
        let ss_tot: f64 = y.iter().map(|y_i| (y_i - y_mean).powi(2)).sum();
        let ss_res: f64 = y.iter().zip(x.iter())
            .map(|(y_i, x_i)| (y_i - (slope * x_i + intercept)).powi(2))
            .sum();
        let r_squared = 1.0 - (ss_res / ss_tot);

        // Calculate prediction interval
        let n = x.len() as f64;
        let x_mean = x.iter().sum::<f64>() / n;
        let x_var = x.iter().map(|x_i| (x_i - x_mean).powi(2)).sum::<f64>() / n;
        let std_err = (ss_res / (n - 2.0)).sqrt();
        let prediction_interval = 1.96 * std_err * (1.0 + 1.0/n + x_var).sqrt();

        Ok(TrendAnalysis {
            slope,
            intercept,
            r_squared,
            prediction_interval,
        })
    }

    pub async fn detect_change_points(&self, points: &[MetricsPoint], window_size: usize) -> Vec<usize> {
        let values: Vec<f64> = points.iter()
            .map(|p| p.total_stake as f64)
            .collect();

        let mut change_points = Vec::new();
        if values.len() < window_size * 2 {
            return change_points;
        }

        for i in window_size..(values.len() - window_size) {
            let left_window: Vec<f64> = values[i-window_size..i].to_vec();
            let right_window: Vec<f64> = values[i..i+window_size].to_vec();

            let left_mean = left_window.mean();
            let right_mean = right_window.mean();
            let left_std = left_window.std_dev();
            let right_std = right_window.std_dev();

            // Calculate Kullback-Leibler divergence
            let kl_div = 0.5 * (
                (right_std.powi(2) / left_std.powi(2)) +
                (left_mean - right_mean).powi(2) / left_std.powi(2) - 1.0 +
                (left_std / right_std).ln()
            );

            if kl_div > 0.5 { // Threshold for change point detection
                change_points.push(i);
            }
        }

        change_points
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
    async fn test_forecasting() {
        let mut collector = MetricsCollector::new();
        
        // Generate synthetic data
        for i in 0..100 {
            let point = MetricsPoint {
                timestamp: Utc::now(),
                total_stake: (i * 100) as u64,
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

        let forecast = collector.forecast_metrics(24).await.unwrap();
        assert_eq!(forecast.point_estimate.len(), 24);
        assert!(forecast.model_quality.mape < 20.0);
    }

    #[tokio::test]
    async fn test_volatility_analysis() {
        let mut collector = MetricsCollector::new();
        
        // Generate synthetic data with increasing volatility
        for i in 0..100 {
            let volatility = (i as f64 / 10.0).sin() * i as f64;
            let point = MetricsPoint {
                timestamp: Utc::now(),
                total_stake: (1000.0 + volatility) as u64,
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

        let volatility = collector.analyze_volatility(24).await.unwrap();
        assert!(volatility > 0.0);
    }
} 