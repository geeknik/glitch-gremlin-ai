use {
    crate::error::GovernanceError,
    ndarray::{Array1, Array2, Axis},
    ndarray_linalg::{Solve, SVD},
    nalgebra::{DMatrix, DVector},
    num_complex::Complex64,
    rustfft::{FftPlanner, num_complex::Complex},
    sprs::{CsMat, CsVec},
    rayon::prelude::*,
    std::f64::consts::PI,
};

#[derive(Debug, Clone)]
pub struct StateEstimate {
    pub state: Array1<f64>,
    pub covariance: Array2<f64>,
    pub innovation: f64,
    pub likelihood: f64,
}

#[derive(Debug)]
pub struct StateEstimator {
    // State space model parameters
    state_dim: usize,
    obs_dim: usize,
    state_transition: Array2<f64>,
    observation: Array2<f64>,
    process_noise: Array2<f64>,
    observation_noise: Array2<f64>,
    
    // Extended Kalman Filter parameters
    initial_state: Array1<f64>,
    initial_covariance: Array2<f64>,
    
    // Particle Filter parameters
    n_particles: usize,
    resampling_threshold: f64,
    
    // RTS Smoother parameters
    smoothing_window: usize,
}

impl Default for StateEstimator {
    fn default() -> Self {
        let state_dim = 4; // position, velocity, acceleration, jerk
        let obs_dim = 1;
        
        Self {
            state_dim,
            obs_dim,
            state_transition: Array2::eye(state_dim),
            observation: Array2::zeros((obs_dim, state_dim)),
            process_noise: Array2::eye(state_dim),
            observation_noise: Array2::eye(obs_dim),
            initial_state: Array1::zeros(state_dim),
            initial_covariance: Array2::eye(state_dim),
            n_particles: 1000,
            resampling_threshold: 0.5,
            smoothing_window: 50,
        }
    }
}

impl StateEstimator {
    pub fn new(state_dim: usize, obs_dim: usize) -> Self {
        let mut estimator = Self {
            state_dim,
            obs_dim,
            state_transition: Array2::eye(state_dim),
            observation: Array2::zeros((obs_dim, state_dim)),
            process_noise: Array2::eye(state_dim),
            observation_noise: Array2::eye(obs_dim),
            initial_state: Array1::zeros(state_dim),
            initial_covariance: Array2::eye(state_dim),
            n_particles: 1000,
            resampling_threshold: 0.5,
            smoothing_window: 50,
        };
        
        // Initialize state transition matrix for higher-order dynamics
        for i in 0..(state_dim-1) {
            estimator.state_transition[[i, i+1]] = 1.0;
        }
        
        // Initialize observation matrix to observe first component
        estimator.observation[[0, 0]] = 1.0;
        
        estimator
    }

    pub fn extended_kalman_filter(
        &self,
        observations: &[f64],
    ) -> Result<Vec<StateEstimate>, GovernanceError> {
        let n = observations.len();
        let mut estimates = Vec::with_capacity(n);
        
        let mut state = self.initial_state.clone();
        let mut covariance = self.initial_covariance.clone();
        
        for &obs in observations {
            // Predict step
            let state_pred = self.state_transition.dot(&state);
            let covariance_pred = self.state_transition.dot(&covariance)
                .dot(&self.state_transition.t()) + &self.process_noise;
            
            // Update step
            let innovation = obs - self.observation.dot(&state_pred)[0];
            let innovation_covariance = self.observation.dot(&covariance_pred)
                .dot(&self.observation.t()) + &self.observation_noise;
            
            let kalman_gain = covariance_pred.dot(&self.observation.t())
                .dot(&innovation_covariance.solve(&Array2::eye(self.obs_dim))
                    .map_err(|_| GovernanceError::InvalidMetrics)?);
            
            state = state_pred + kalman_gain.dot(&Array1::from_vec(vec![innovation]));
            covariance = &covariance_pred - kalman_gain.dot(&self.observation).dot(&covariance_pred);
            
            // Calculate likelihood
            let likelihood = (-0.5 * (innovation.powi(2) / innovation_covariance[[0, 0]] +
                            (2.0 * PI * innovation_covariance[[0, 0]]).ln())).exp();
            
            estimates.push(StateEstimate {
                state: state.clone(),
                covariance: covariance.clone(),
                innovation,
                likelihood,
            });
        }
        
        Ok(estimates)
    }

    pub fn unscented_kalman_filter(
        &self,
        observations: &[f64],
    ) -> Result<Vec<StateEstimate>, GovernanceError> {
        let n = observations.len();
        let mut estimates = Vec::with_capacity(n);
        
        let lambda = 3.0 - self.state_dim as f64;
        let weights_m = vec![lambda / (self.state_dim as f64 + lambda); 2 * self.state_dim + 1];
        let weights_c = weights_m.clone();
        
        let mut state = self.initial_state.clone();
        let mut covariance = self.initial_covariance.clone();
        
        for &obs in observations {
            // Generate sigma points
            let l = (&covariance * (self.state_dim as f64 + lambda))
                .svd(true, true)
                .map_err(|_| GovernanceError::InvalidMetrics)?;
            let sigma_points: Vec<Array1<f64>> = (0..2*self.state_dim+1)
                .map(|i| {
                    if i == 0 {
                        state.clone()
                    } else if i <= self.state_dim {
                        &state + &l.1.column(i-1)
                    } else {
                        &state - &l.1.column(i-1-self.state_dim)
                    }
                })
                .collect();
            
            // Predict step
            let predicted_sigma_points: Vec<Array1<f64>> = sigma_points.iter()
                .map(|s| self.state_transition.dot(s))
                .collect();
            
            let state_pred = predicted_sigma_points.iter()
                .zip(weights_m.iter())
                .fold(Array1::zeros(self.state_dim), |acc, (s, &w)| acc + s * w);
            
            let covariance_pred = predicted_sigma_points.iter()
                .zip(weights_c.iter())
                .fold(self.process_noise.clone(), |acc, (s, &w)| {
                    acc + w * (&(s - &state_pred)).outer(&(s - &state_pred))
                });
            
            // Update step
            let predicted_obs: Vec<f64> = predicted_sigma_points.iter()
                .map(|s| self.observation.dot(s)[0])
                .collect();
            
            let obs_pred = predicted_obs.iter()
                .zip(weights_m.iter())
                .fold(0.0, |acc, (&o, &w)| acc + w * o);
            
            let innovation = obs - obs_pred;
            
            let cross_correlation = predicted_sigma_points.iter()
                .zip(predicted_obs.iter())
                .zip(weights_c.iter())
                .fold(Array2::zeros((self.state_dim, self.obs_dim)), |acc, ((s, &o), &w)| {
                    acc + w * (&(s - &state_pred)).outer(&Array1::from_vec(vec![o - obs_pred]))
                });
            
            let innovation_covariance = predicted_obs.iter()
                .zip(weights_c.iter())
                .fold(self.observation_noise.clone(), |acc, (&o, &w)| {
                    acc + w * (o - obs_pred).powi(2)
                });
            
            let kalman_gain = cross_correlation.dot(
                &innovation_covariance.solve(&Array2::eye(self.obs_dim))
                    .map_err(|_| GovernanceError::InvalidMetrics)?
            );
            
            state = state_pred + kalman_gain.dot(&Array1::from_vec(vec![innovation]));
            covariance = &covariance_pred - kalman_gain.dot(&Array2::from_elem((1, 1), innovation_covariance))
                .dot(&kalman_gain.t());
            
            let likelihood = (-0.5 * (innovation.powi(2) / innovation_covariance +
                            (2.0 * PI * innovation_covariance).ln())).exp();
            
            estimates.push(StateEstimate {
                state: state.clone(),
                covariance: covariance.clone(),
                innovation,
                likelihood,
            });
        }
        
        Ok(estimates)
    }

    pub fn particle_filter(
        &self,
        observations: &[f64],
    ) -> Result<Vec<StateEstimate>, GovernanceError> {
        let n = observations.len();
        let mut estimates = Vec::with_capacity(n);
        
        // Initialize particles
        let mut particles = Array2::zeros((self.n_particles, self.state_dim));
        let mut weights = Array1::from_elem(self.n_particles, 1.0 / self.n_particles as f64);
        
        for &obs in observations {
            // Predict step - propagate particles through state model
            particles = particles.mapv(|x| x + rand::random::<f64>() * 0.1);
            
            // Update step - calculate weights
            let obs_pred: Array1<f64> = particles.outer_iter()
                .map(|p| self.observation.dot(&p)[0])
                .collect();
            
            weights = obs_pred.mapv(|x| {
                let innovation = obs - x;
                (-0.5 * innovation.powi(2) / self.observation_noise[[0, 0]]).exp()
            });
            
            // Normalize weights
            let sum_weights = weights.sum();
            weights.mapv_inplace(|w| w / sum_weights);
            
            // Calculate effective sample size and resample if necessary
            let n_eff = 1.0 / weights.mapv(|w| w.powi(2)).sum();
            if n_eff < self.n_particles as f64 * self.resampling_threshold {
                let indices = self.systematic_resample(&weights);
                particles = indices.iter()
                    .map(|&i| particles.row(i).to_owned())
                    .collect();
                weights.fill(1.0 / self.n_particles as f64);
            }
            
            // Calculate state estimate
            let state = particles.t().dot(&weights);
            let centered = &particles - &state.broadcast((self.n_particles, self.state_dim));
            let covariance = centered.t().dot(&(centered.t().to_owned() * &weights));
            
            estimates.push(StateEstimate {
                state,
                covariance,
                innovation: obs - self.observation.dot(&state)[0],
                likelihood: weights.mean().unwrap_or(0.0),
            });
        }
        
        Ok(estimates)
    }

    fn systematic_resample(&self, weights: &Array1<f64>) -> Vec<usize> {
        let mut indices = Vec::with_capacity(self.n_particles);
        let u0 = rand::random::<f64>() / self.n_particles as f64;
        let mut c = weights[0];
        let mut j = 0;
        
        for i in 0..self.n_particles {
            let u = u0 + i as f64 / self.n_particles as f64;
            while u > c && j < self.n_particles - 1 {
                j += 1;
                c += weights[j];
            }
            indices.push(j);
        }
        
        indices
    }

    pub fn rts_smoother(
        &self,
        forward_estimates: &[StateEstimate],
    ) -> Result<Vec<StateEstimate>, GovernanceError> {
        let n = forward_estimates.len();
        let mut smoothed_estimates = forward_estimates.to_vec();
        
        for t in (0..n-1).rev() {
            let state_pred = self.state_transition.dot(&forward_estimates[t].state);
            let covariance_pred = self.state_transition.dot(&forward_estimates[t].covariance)
                .dot(&self.state_transition.t()) + &self.process_noise;
            
            let gain = forward_estimates[t].covariance.dot(&self.state_transition.t())
                .dot(&covariance_pred.solve(&Array2::eye(self.state_dim))
                    .map_err(|_| GovernanceError::InvalidMetrics)?);
            
            let innovation = &smoothed_estimates[t+1].state - &state_pred;
            
            smoothed_estimates[t].state = &forward_estimates[t].state + &gain.dot(&innovation);
            smoothed_estimates[t].covariance = &forward_estimates[t].covariance +
                gain.dot(&(&smoothed_estimates[t+1].covariance - &covariance_pred))
                .dot(&gain.t());
        }
        
        Ok(smoothed_estimates)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_extended_kalman_filter() {
        let estimator = StateEstimator::new(4, 1);
        let observations: Vec<f64> = (0..100)
            .map(|i| {
                let t = i as f64 * 0.1;
                let true_state = t.sin();
                true_state + rand::random::<f64>() * 0.1
            })
            .collect();

        let estimates = estimator.extended_kalman_filter(&observations)
            .expect("Filtering should succeed");

        assert_eq!(estimates.len(), observations.len());
        
        // Check that innovations are reasonable
        let mean_innovation: f64 = estimates.iter()
            .map(|e| e.innovation.abs())
            .sum::<f64>() / estimates.len() as f64;
        assert!(mean_innovation < 0.2);
    }

    #[test]
    fn test_unscented_kalman_filter() {
        let estimator = StateEstimator::new(4, 1);
        let observations: Vec<f64> = (0..100)
            .map(|i| {
                let t = i as f64 * 0.1;
                let true_state = t.sin();
                true_state + rand::random::<f64>() * 0.1
            })
            .collect();

        let estimates = estimator.unscented_kalman_filter(&observations)
            .expect("Filtering should succeed");

        assert_eq!(estimates.len(), observations.len());
        
        // Verify state estimates are reasonable
        for est in estimates.iter() {
            assert!(est.state.iter().all(|&x| x.abs() < 10.0));
        }
    }

    proptest! {
        #[test]
        fn test_particle_filter_properties(
            n_obs in 10..100usize,
        ) {
            let estimator = StateEstimator::new(4, 1);
            let observations: Vec<f64> = (0..n_obs)
                .map(|i| {
                    let t = i as f64 * 0.1;
                    let true_state = t.sin();
                    true_state + rand::random::<f64>() * 0.1
                })
                .collect();

            let estimates = estimator.particle_filter(&observations)
                .expect("Particle filtering should succeed");

            prop_assert_eq!(estimates.len(), n_obs);
            
            // Check that all likelihoods are valid probabilities
            for est in estimates.iter() {
                prop_assert!(est.likelihood >= 0.0 && est.likelihood <= 1.0);
            }
        }
    }
} 