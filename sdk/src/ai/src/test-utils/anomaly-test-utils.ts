import { TimeSeriesMetrics } from '../anomaly-detection';

export function generateAnomalousMetrics(numPoints: number): TimeSeriesMetrics[] {
    const metrics: TimeSeriesMetrics[] = [];

    for (let i = 0; i < numPoints; i++) {
        metrics.push({
            instructionFrequency: [Math.random() * 100], // Ensure array has at least one element
            memoryAccess: [Math.random() * 100], // Ensure array has at least one element
            accountAccess: [Math.random() * 100], // Ensure array has at least one element
            stateChanges: [Math.random() * 100], // Ensure array has at least one element
            timestamp: Date.now() + i * 1000
        });

        if (i > numPoints / 2) {
            // Introduce anomaly
            metrics[i].instructionFrequency = [metrics[i].instructionFrequency[0] * 2];
            metrics[i].memoryAccess = [metrics[i].memoryAccess[0] * 2];
            metrics[i].accountAccess = [metrics[i].accountAccess[0] * 2];
            metrics[i].stateChanges = [metrics[i].stateChanges[0] * 2];
        }
    }

    return metrics;
}
