import { TimeSeriesMetric } from '../types';

/**
* Generates synthetic time series metrics with anomalies for testing
* @param count Number of metrics to generate
* @returns Array of TimeSeriesMetrics with synthetic anomalous data
*/
export function generateAnomalousMetrics(count: number): TimeSeriesMetric[] {
    const metrics: TimeSeriesMetric[] = [];
    const baseFrequency = 0.1;
    const now = Date.now();
    
    for (let i = 0; i < count; i++) {
        const timestamp = now - (count - i) * 60000; // One minute intervals
        
        // Generate base sine wave pattern
        let value = Math.sin(i * baseFrequency) * 50 + 100;
        
        // Randomly inject anomalies (20% chance)
        if (Math.random() < 0.2) {
            // Add sudden spikes or drops
            value *= Math.random() < 0.5 ? 2.5 : 0.3;
        }
        
        // Add some random noise
        value += (Math.random() - 0.5) * 10;
        
        metrics.push({
            timestamp,
            value: Math.max(0, value) // Ensure non-negative values
        });
    }
    
    return metrics;
}

