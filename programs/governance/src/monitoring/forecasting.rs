use {
    crate::error::GovernanceError,
    ndarray::{Array1, Array2, Axis},
    ndarray_stats::QuantileExt,
    nalgebra::{DMatrix, DVector},
    rand_distr::{Distribution, Normal},
    rayon::prelude::*,
    itertools::Itertools,
    kalman::{KalmanFilter, Matrix},
    argmin::prelude::*,
    optimization::Minimizer,
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

#[derive(Debug)]
pub struct ExponentialSmoothingParams {
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
    pub seasonal_periods: usize,
}

impl Default for ExponentialSmoothingParams {
    fn default() -> Self {
        Self {
            alpha: 0.2,
            beta: 0.1,
            gamma: 0.1,
            seasonal_periods: 24,
        }
    }
}

pub struct TimeSeriesForecaster {
    kalman_filter: KalmanFilter,
    normal_dist: Normal<f64>,
}

impl TimeSeriesForecaster {
    pub fn new() -> Self {
        let state_transition = Matrix::identity(2, 2);
        let observation = Matrix::new(1, 2, vec![1.0, 0.0]);
        let process_noise = Matrix::identity(2, 2);
        let observation_noise = Matrix::new(1, 1, vec![1.0]);
        let kalman_filter = KalmanFilter::new(
            state_transition,
            observation,
            process_noise,
            observation_noise,
        );
        let normal_dist = Normal::new(0.0, 1.0).unwrap();

        Self {
            kalman_filter,
            normal_dist,
        }
    }

    pub fn triple_exponential_smoothing(
        &self,
        data: &[f64],
        params: &ExponentialSmoothingParams,
        horizon: usize,
    ) -> Result<ForecastResult, GovernanceError> {
        if data.len() < params.seasonal_periods * 2 {
            return Err(GovernanceError::InvalidMetrics);
        }

        let n = data.len();
        let mut level = vec![0.0; n + horizon];
        let mut trend = vec![0.0; n + horizon];
        let mut seasonal = vec![0.0; n + horizon];
        let mut forecast = vec![0.0; n + horizon];

        // Initialize level, trend, and seasonal components
        level[0] = data[0];
        trend[0] = data[1] - data[0];
        for i in 0..params.seasonal_periods {
            seasonal[i] = data[i] / level[0];
        }

        // Fit model
        for t in 1..n {
            let q = t % params.seasonal_periods;
            level[t] = params.alpha * (data[t] / seasonal[q]) + 
                      (1.0 - params.alpha) * (level[t-1] + trend[t-1]);
            trend[t] = params.beta * (level[t] - level[t-1]) + 
                      (1.0 - params.beta) * trend[t-1];
            seasonal[t] = params.gamma * (data[t] / level[t]) + 
                         (1.0 - params.gamma) * seasonal[q];
            forecast[t] = (level[t] + trend[t]) * seasonal[q];
        }

        // Generate forecasts
        for t in n..(n + horizon) {
            let q = t % params.seasonal_periods;
            level[t] = level[t-1] + trend[t-1];
            trend[t] = trend[t-1];
            seasonal[t] = seasonal[q];
            forecast[t] = level[t] * seasonal[q];
        }

        // Calculate prediction intervals
        let residuals: Vec<f64> = data.iter()
            .zip(forecast.iter())
            .map(|(actual, pred)| actual - pred)
            .collect();
        
        let rmse = (residuals.iter()
            .map(|e| e.powi(2))
            .sum::<f64>() / n as f64)
            .sqrt();

        let z_score = 1.96; // 95% confidence interval
        let lower_bound: Vec<f64> = forecast.iter()
            .map(|f| f - z_score * rmse)
            .collect();
        let upper_bound: Vec<f64> = forecast.iter()
            .map(|f| f + z_score * rmse)
            .collect();

        // Calculate model quality metrics
        let mse = rmse.powi(2);
        let mae = residuals.iter().map(|e| e.abs()).sum::<f64>() / n as f64;
        let mape = residuals.iter()
            .zip(data.iter())
            .map(|(e, a)| e.abs() / a)
            .sum::<f64>() / n as f64 * 100.0;

        // Calculate information criteria
        let k = 3; // number of parameters (alpha, beta, gamma)
        let log_likelihood = -n as f64 / 2.0 * (1.0 + (2.0 * PI).ln() + (mse).ln());
        let aic = 2.0 * k as f64 - 2.0 * log_likelihood;
        let bic = k as f64 * n.ln() - 2.0 * log_likelihood;

        Ok(ForecastResult {
            point_estimate: forecast[n..].to_vec(),
            lower_bound: lower_bound[n..].to_vec(),
            upper_bound: upper_bound[n..].to_vec(),
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

    pub fn kalman_forecast(
        &mut self,
        data: &[f64],
        horizon: usize,
    ) -> Result<ForecastResult, GovernanceError> {
        let n = data.len();
        let mut state = Matrix::new(2, 1, vec![data[0], 0.0]);
        let mut covariance = Matrix::identity(2, 2);
        let mut filtered_values = Vec::with_capacity(n);

        // Filter step
        for &value in data {
            let observation = Matrix::new(1, 1, vec![value]);
            let (new_state, new_covariance) = self.kalman_filter.update(
                state,
                covariance,
                observation,
            );
            state = new_state;
            covariance = new_covariance;
            filtered_values.push(state.get(0, 0));
        }

        // Forecast step
        let mut forecasts = Vec::with_capacity(horizon);
        let mut lower_bound = Vec::with_capacity(horizon);
        let mut upper_bound = Vec::with_capacity(horizon);

        for _ in 0..horizon {
            let (new_state, new_covariance) = self.kalman_filter.predict(state, covariance);
            state = new_state;
            covariance = new_covariance;

            let forecast = state.get(0, 0);
            let variance = covariance.get(0, 0);
            let std_dev = variance.sqrt();

            forecasts.push(forecast);
            lower_bound.push(forecast - 1.96 * std_dev);
            upper_bound.push(forecast + 1.96 * std_dev);
        }

        // Calculate model quality metrics
        let residuals: Vec<f64> = data.iter()
            .zip(filtered_values.iter())
            .map(|(actual, pred)| actual - pred)
            .collect();

        let n = n as f64;
        let mse = residuals.iter().map(|e| e.powi(2)).sum::<f64>() / n;
        let mae = residuals.iter().map(|e| e.abs()).sum::<f64>() / n;
        let mape = residuals.iter()
            .zip(data.iter())
            .map(|(e, a)| e.abs() / a)
            .sum::<f64>() / n * 100.0;

        let k = 4; // number of parameters in Kalman filter
        let log_likelihood = -n / 2.0 * (1.0 + (2.0 * PI).ln() + (mse).ln());
        let aic = 2.0 * k as f64 - 2.0 * log_likelihood;
        let bic = k as f64 * n.ln() - 2.0 * log_likelihood;

        Ok(ForecastResult {
            point_estimate: forecasts,
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

    pub fn ensemble_forecast(
        &mut self,
        data: &[f64],
        horizon: usize,
        params: &ExponentialSmoothingParams,
    ) -> Result<ForecastResult, GovernanceError> {
        // Get forecasts from different models
        let exp_smooth = self.triple_exponential_smoothing(data, params, horizon)?;
        let kalman = self.kalman_forecast(data, horizon)?;

        // Combine forecasts using weighted average based on model quality
        let exp_weight = 1.0 / exp_smooth.model_quality.aic;
        let kalman_weight = 1.0 / kalman.model_quality.aic;
        let total_weight = exp_weight + kalman_weight;

        let point_estimate: Vec<f64> = exp_smooth.point_estimate.iter()
            .zip(kalman.point_estimate.iter())
            .map(|(e, k)| (e * exp_weight + k * kalman_weight) / total_weight)
            .collect();

        let lower_bound: Vec<f64> = exp_smooth.lower_bound.iter()
            .zip(kalman.lower_bound.iter())
            .map(|(e, k)| (e * exp_weight + k * kalman_weight) / total_weight)
            .collect();

        let upper_bound: Vec<f64> = exp_smooth.upper_bound.iter()
            .zip(kalman.upper_bound.iter())
            .map(|(e, k)| (e * exp_weight + k * kalman_weight) / total_weight)
            .collect();

        // Calculate ensemble model quality
        let mse = (exp_smooth.model_quality.mse * exp_weight + 
                  kalman.model_quality.mse * kalman_weight) / total_weight;
        let mae = (exp_smooth.model_quality.mae * exp_weight + 
                  kalman.model_quality.mae * kalman_weight) / total_weight;
        let mape = (exp_smooth.model_quality.mape * exp_weight + 
                   kalman.model_quality.mape * kalman_weight) / total_weight;
        let aic = (exp_smooth.model_quality.aic * exp_weight + 
                  kalman.model_quality.aic * kalman_weight) / total_weight;
        let bic = (exp_smooth.model_quality.bic * exp_weight + 
                  kalman.model_quality.bic * kalman_weight) / total_weight;

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
    fn test_triple_exponential_smoothing() {
        let data: Vec<f64> = (0..100)
            .map(|i| {
                let trend = i as f64 * 0.1;
                let seasonal = (i as f64 * PI / 12.0).sin() * 5.0;
                let noise = rand::random::<f64>() * 0.5;
                trend + seasonal + noise
            })
            .collect();

        let forecaster = TimeSeriesForecaster::new();
        let params = ExponentialSmoothingParams::default();
        let result = forecaster.triple_exponential_smoothing(&data, &params, 24)
            .expect("Forecast should succeed");

        assert_eq!(result.point_estimate.len(), 24);
        assert!(result.model_quality.mape < 20.0); // MAPE should be reasonable
    }

    #[test]
    fn test_kalman_forecast() {
        let data: Vec<f64> = (0..100)
            .map(|i| {
                let trend = i as f64 * 0.1;
                let noise = rand::random::<f64>() * 0.5;
                trend + noise
            })
            .collect();

        let mut forecaster = TimeSeriesForecaster::new();
        let result = forecaster.kalman_forecast(&data, 24)
            .expect("Forecast should succeed");

        assert_eq!(result.point_estimate.len(), 24);
        assert!(result.model_quality.mape < 15.0); // Kalman should be more accurate for linear trends
    }

    proptest! {
        #[test]
        fn test_ensemble_forecast_properties(
            data_length in 50..200usize,
            horizon in 10..50usize,
        ) {
            let data: Vec<f64> = (0..data_length)
                .map(|i| {
                    let trend = i as f64 * 0.1;
                    let seasonal = (i as f64 * PI / 12.0).sin() * 5.0;
                    let noise = rand::random::<f64>() * 0.5;
                    trend + seasonal + noise
                })
                .collect();

            let mut forecaster = TimeSeriesForecaster::new();
            let params = ExponentialSmoothingParams::default();
            let result = forecaster.ensemble_forecast(&data, horizon, &params)
                .expect("Ensemble forecast should succeed");

            prop_assert_eq!(result.point_estimate.len(), horizon);
            prop_assert_eq!(result.lower_bound.len(), horizon);
            prop_assert_eq!(result.upper_bound.len(), horizon);
            
            // Check that bounds contain point estimates
            for i in 0..horizon {
                prop_assert!(result.lower_bound[i] <= result.point_estimate[i]);
                prop_assert!(result.point_estimate[i] <= result.upper_bound[i]);
            }
        }
    }
} 