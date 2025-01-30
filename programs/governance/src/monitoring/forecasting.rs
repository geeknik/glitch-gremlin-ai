use {
    crate::error::GovernanceError,
    ndarray::{Array1, Array2, Axis},
    ndarray_linalg::{Solve, SVD},
    nalgebra::{DMatrix, DVector},
    num_complex::Complex64,
    rustfft::{FftPlanner, num_complex::Complex},
    sprs::{CsMat, CsVec},
    rayon::prelude::*,
    itertools::Itertools,
    super::state_estimation::{StateEstimator, StateEstimate},
    std::f64::consts::PI,
};

#[derive(Debug, Clone)]
pub struct ForecastResult {
    pub point_estimate: Vec<f64>,
    pub lower_bound: Vec<f64>,
    pub upper_bound: Vec<f64>,
    pub confidence_level: f64,
    pub model_quality: ModelQuality,
}

#[derive(Debug, Clone)]
pub struct ModelQuality {
    pub mse: f64,
    pub mae: f64,
    pub mape: f64,
    pub aic: f64,
    pub bic: f64,
}

pub struct TimeSeriesForecaster {
    state_estimator: StateEstimator,
}

impl TimeSeriesForecaster {
    pub fn new() -> Self {
        Self {
            state_estimator: StateEstimator::new(4, 1), // 4-dimensional state for position, velocity, acceleration, jerk
        }
    }

    pub fn calculate_volatility(&self, data: &[f64]) -> f64 {
        if data.len() < 2 {
            return 0.0;
        }

        let returns: Vec<f64> = data.windows(2)
            .map(|w| (w[1] - w[0]) / w[0])
            .collect();

        let mean = returns.iter().sum::<f64>() / returns.len() as f64;
        let variance = returns.iter()
            .map(|r| (r - mean).powi(2))
            .sum::<f64>() / (returns.len() - 1) as f64;

        variance.sqrt() * (252.0_f64).sqrt() // Annualized volatility
    }

    pub fn triple_exponential_smoothing(
        &mut self,
        data: &[f64],
        horizon: usize,
    ) -> Result<ForecastResult, GovernanceError> {
        // First, use state estimation to get a clean signal
        let estimates = self.state_estimator.extended_kalman_filter(data)?;
        let filtered_data: Vec<f64> = estimates.iter()
            .map(|e| e.state[0])
            .collect();

        // Decompose the signal into trend, seasonal, and residual components
        let n = filtered_data.len();
        let seasonal_period = 24; // Daily seasonality

        // Calculate trend using linear regression
        let x: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let y = &filtered_data;
        
        let x_mean = x.iter().sum::<f64>() / n as f64;
        let y_mean = y.iter().sum::<f64>() / n as f64;
        
        let numerator = x.iter().zip(y.iter())
            .map(|(&x, &y)| (x - x_mean) * (y - y_mean))
            .sum::<f64>();
        let denominator = x.iter()
            .map(|&x| (x - x_mean).powi(2))
            .sum::<f64>();
        
        let slope = numerator / denominator;
        let intercept = y_mean - slope * x_mean;

        // Calculate trend values
        let trend: Vec<f64> = x.iter()
            .map(|&x| slope * x + intercept)
            .collect();

        // Calculate seasonal indices
        let mut seasonal_indices = vec![0.0; seasonal_period];
        let mut counts = vec![0; seasonal_period];

        for i in 0..n {
            let period_idx = i % seasonal_period;
            seasonal_indices[period_idx] += (filtered_data[i] - trend[i]) / trend[i];
            counts[period_idx] += 1;
        }

        for i in 0..seasonal_period {
            seasonal_indices[i] /= counts[i] as f64;
        }

        // Generate forecasts
        let mut forecasts = Vec::with_capacity(horizon);
        let mut lower_bounds = Vec::with_capacity(horizon);
        let mut upper_bounds = Vec::with_capacity(horizon);

        for i in 0..horizon {
            let t = (n + i) as f64;
            let trend_forecast = slope * t + intercept;
            let seasonal_idx = (n + i) % seasonal_period;
            let forecast = trend_forecast * (1.0 + seasonal_indices[seasonal_idx]);
            
            forecasts.push(forecast);

            // Calculate prediction intervals
            let std_err = estimates.iter()
                .map(|e| e.innovation.powi(2))
                .sum::<f64>() / (n - 2) as f64;
            let std_err = std_err.sqrt();
            
            let t_value = 1.96; // 95% confidence interval
            let forecast_err = t_value * std_err * (1.0 + 1.0/n as f64 +
                (t - x_mean).powi(2) / denominator).sqrt();
            
            lower_bounds.push(forecast - forecast_err);
            upper_bounds.push(forecast + forecast_err);
        }

        // Calculate model quality metrics
        let residuals: Vec<f64> = filtered_data.iter()
            .zip(trend.iter())
            .map(|(&actual, &pred)| actual - pred)
            .collect();

        let mse = residuals.iter()
            .map(|e| e.powi(2))
            .sum::<f64>() / n as f64;
        let mae = residuals.iter()
            .map(|e| e.abs())
            .sum::<f64>() / n as f64;
        let mape = residuals.iter()
            .zip(filtered_data.iter())
            .map(|(e, a)| e.abs() / a)
            .sum::<f64>() / n as f64 * 100.0;

        // Calculate information criteria
        let k = 3; // number of parameters (level, trend, seasonal)
        let log_likelihood = -n as f64 / 2.0 * (1.0 + (2.0 * PI).ln() + (mse).ln());
        let aic = 2.0 * k as f64 - 2.0 * log_likelihood;
        let bic = k as f64 * (n as f64).ln() - 2.0 * log_likelihood;

        Ok(ForecastResult {
            point_estimate: forecasts,
            lower_bound: lower_bounds,
            upper_bound: upper_bounds,
            confidence_level: 0.95,
            model_quality: ModelQuality {
                mse,
                mae,
                mape,
                aic,
                bic,
            },
        })
    }

    pub fn ensemble_forecast(
        &mut self,
        data: &[f64],
        horizon: usize,
    ) -> Result<ForecastResult, GovernanceError> {
        // Get state estimates using different filters
        let ekf_estimates = self.state_estimator.extended_kalman_filter(data)?;
        let ukf_estimates = self.state_estimator.unscented_kalman_filter(data)?;
        let pf_estimates = self.state_estimator.particle_filter(data)?;

        // Generate forecasts using triple exponential smoothing on filtered data
        let ekf_forecast = self.triple_exponential_smoothing(
            &ekf_estimates.iter().map(|e| e.state[0]).collect::<Vec<_>>(),
            horizon
        )?;
        
        let ukf_forecast = self.triple_exponential_smoothing(
            &ukf_estimates.iter().map(|e| e.state[0]).collect::<Vec<_>>(),
            horizon
        )?;
        
        let pf_forecast = self.triple_exponential_smoothing(
            &pf_estimates.iter().map(|e| e.state[0]).collect::<Vec<_>>(),
            horizon
        )?;

        // Combine forecasts using inverse variance weighting
        let ekf_weight = 1.0 / ekf_forecast.model_quality.mse;
        let ukf_weight = 1.0 / ukf_forecast.model_quality.mse;
        let pf_weight = 1.0 / pf_forecast.model_quality.mse;
        let total_weight = ekf_weight + ukf_weight + pf_weight;

        let point_estimate: Vec<f64> = (0..horizon)
            .map(|i| {
                (ekf_forecast.point_estimate[i] * ekf_weight +
                 ukf_forecast.point_estimate[i] * ukf_weight +
                 pf_forecast.point_estimate[i] * pf_weight) / total_weight
            })
            .collect();

        let lower_bound: Vec<f64> = (0..horizon)
            .map(|i| {
                (ekf_forecast.lower_bound[i] * ekf_weight +
                 ukf_forecast.lower_bound[i] * ukf_weight +
                 pf_forecast.lower_bound[i] * pf_weight) / total_weight
            })
            .collect();

        let upper_bound: Vec<f64> = (0..horizon)
            .map(|i| {
                (ekf_forecast.upper_bound[i] * ekf_weight +
                 ukf_forecast.upper_bound[i] * ukf_weight +
                 pf_forecast.upper_bound[i] * pf_weight) / total_weight
            })
            .collect();

        // Calculate ensemble model quality metrics
        let mse = (ekf_forecast.model_quality.mse * ekf_weight +
                  ukf_forecast.model_quality.mse * ukf_weight +
                  pf_forecast.model_quality.mse * pf_weight) / total_weight;
        
        let mae = (ekf_forecast.model_quality.mae * ekf_weight +
                  ukf_forecast.model_quality.mae * ukf_weight +
                  pf_forecast.model_quality.mae * pf_weight) / total_weight;
        
        let mape = (ekf_forecast.model_quality.mape * ekf_weight +
                   ukf_forecast.model_quality.mape * ukf_weight +
                   pf_forecast.model_quality.mape * pf_weight) / total_weight;
        
        let aic = (ekf_forecast.model_quality.aic * ekf_weight +
                  ukf_forecast.model_quality.aic * ukf_weight +
                  pf_forecast.model_quality.aic * pf_weight) / total_weight;
        
        let bic = (ekf_forecast.model_quality.bic * ekf_weight +
                  ukf_forecast.model_quality.bic * ukf_weight +
                  pf_forecast.model_quality.bic * pf_weight) / total_weight;

        Ok(ForecastResult {
            point_estimate,
            lower_bound,
            upper_bound,
            confidence_level: 0.95,
            model_quality: ModelQuality {
                mse,
                mae,
                mape,
                aic,
                bic,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_volatility_calculation() {
        let forecaster = TimeSeriesForecaster::new();
        let data: Vec<f64> = (0..100)
            .map(|i| {
                let t = i as f64 * 0.1;
                let trend = t * 0.1;
                let volatility = (t * 0.5).sin() * 0.2;
                (trend + volatility).exp()
            })
            .collect();

        let vol = forecaster.calculate_volatility(&data);
        assert!(vol > 0.0 && vol < 1.0);
    }

    #[test]
    fn test_triple_exponential_smoothing() {
        let mut forecaster = TimeSeriesForecaster::new();
        let data: Vec<f64> = (0..100)
            .map(|i| {
                let t = i as f64 * 0.1;
                let trend = t * 0.1;
                let seasonal = (t * PI / 12.0).sin() * 5.0;
                let noise = rand::random::<f64>() * 0.5;
                trend + seasonal + noise
            })
            .collect();

        let forecast = forecaster.triple_exponential_smoothing(&data, 24)
            .expect("Forecast should succeed");

        assert_eq!(forecast.point_estimate.len(), 24);
        assert!(forecast.model_quality.mape < 20.0);
    }

    proptest! {
        #[test]
        fn test_ensemble_forecast_properties(
            n_obs in 50..200usize,
            horizon in 10..50usize,
        ) {
            let mut forecaster = TimeSeriesForecaster::new();
            let data: Vec<f64> = (0..n_obs)
                .map(|i| {
                    let t = i as f64 * 0.1;
                    let trend = t * 0.1;
                    let seasonal = (t * PI / 12.0).sin() * 5.0;
                    let noise = rand::random::<f64>() * 0.5;
                    trend + seasonal + noise
                })
                .collect();

            let forecast = forecaster.ensemble_forecast(&data, horizon)
                .expect("Ensemble forecast should succeed");

            prop_assert_eq!(forecast.point_estimate.len(), horizon);
            prop_assert_eq!(forecast.lower_bound.len(), horizon);
            prop_assert_eq!(forecast.upper_bound.len(), horizon);
            
            // Check that bounds contain point estimates
            for i in 0..horizon {
                prop_assert!(forecast.lower_bound[i] <= forecast.point_estimate[i]);
                prop_assert!(forecast.point_estimate[i] <= forecast.upper_bound[i]);
            }
        }
    }
} 