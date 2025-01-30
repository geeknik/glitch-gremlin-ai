use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use glitch_gremlin_governance::monitoring::{
    forecasting::TimeSeriesForecaster,
    state_estimation::StateEstimator,
};
use std::f64::consts::PI;

fn generate_test_data(n: usize, complexity: f64) -> Vec<f64> {
    (0..n)
        .map(|i| {
            let t = i as f64 * 0.1;
            let trend = t * 0.1;
            let seasonal = (t * PI / 12.0).sin() * 5.0;
            let chaos = (t * complexity).sin() * (t * 0.3).cos() * 2.0;
            let noise = rand::random::<f64>() * 0.5;
            trend + seasonal + chaos + noise
        })
        .collect()
}

fn benchmark_volatility(c: &mut Criterion) {
    let mut group = c.benchmark_group("volatility_calculation");
    let forecaster = TimeSeriesForecaster::new();

    for size in [100, 500, 1000, 5000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            let data = generate_test_data(size, 1.0);
            b.iter(|| forecaster.calculate_volatility(black_box(&data)))
        });
    }
    group.finish();
}

fn benchmark_triple_exponential_smoothing(c: &mut Criterion) {
    let mut group = c.benchmark_group("triple_exponential_smoothing");
    
    for size in [100, 500, 1000].iter() {
        for horizon in [24, 48, 96].iter() {
            group.bench_with_input(
                BenchmarkId::new("data_size", format!("{}x{}", size, horizon)),
                &(*size, *horizon),
                |b, &(size, horizon)| {
                    let mut forecaster = TimeSeriesForecaster::new();
                    let data = generate_test_data(size, 1.5);
                    b.iter(|| {
                        forecaster.triple_exponential_smoothing(
                            black_box(&data),
                            black_box(horizon),
                        )
                    })
                },
            );
        }
    }
    group.finish();
}

fn benchmark_ensemble_forecast(c: &mut Criterion) {
    let mut group = c.benchmark_group("ensemble_forecast");
    
    for size in [100, 500].iter() {
        for horizon in [24, 48].iter() {
            for complexity in [1.0, 2.0].iter() {
                group.bench_with_input(
                    BenchmarkId::new(
                        "complexity",
                        format!("{}x{}x{:.1}", size, horizon, complexity),
                    ),
                    &(*size, *horizon, *complexity),
                    |b, &(size, horizon, complexity)| {
                        let mut forecaster = TimeSeriesForecaster::new();
                        let data = generate_test_data(size, complexity);
                        b.iter(|| {
                            forecaster.ensemble_forecast(
                                black_box(&data),
                                black_box(horizon),
                            )
                        })
                    },
                );
            }
        }
    }
    group.finish();
}

fn benchmark_state_estimation(c: &mut Criterion) {
    let mut group = c.benchmark_group("state_estimation");
    let estimator = StateEstimator::new(4, 1);

    for size in [100, 500, 1000].iter() {
        // Benchmark EKF
        group.bench_with_input(
            BenchmarkId::new("ekf", size),
            size,
            |b, &size| {
                let data = generate_test_data(size, 1.5);
                b.iter(|| estimator.extended_kalman_filter(black_box(&data)))
            },
        );

        // Benchmark UKF
        group.bench_with_input(
            BenchmarkId::new("ukf", size),
            size,
            |b, &size| {
                let data = generate_test_data(size, 1.5);
                b.iter(|| estimator.unscented_kalman_filter(black_box(&data)))
            },
        );

        // Benchmark Particle Filter
        group.bench_with_input(
            BenchmarkId::new("particle_filter", size),
            size,
            |b, &size| {
                let data = generate_test_data(size, 1.5);
                b.iter(|| estimator.particle_filter(black_box(&data)))
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    benchmark_volatility,
    benchmark_triple_exponential_smoothing,
    benchmark_ensemble_forecast,
    benchmark_state_estimation,
);
criterion_main!(benches); 