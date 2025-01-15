import { TimeSeriesMetric } from '../anomaly-detection';

export function generateAnomalousMetrics(numPoints: number): TimeSeriesMetric[] {
    const metrics: TimeSeriesMetric[] = [];

    for (let i = 0; i < numPoints; i++) {
        metrics.push({
            instructionFrequency: [Math.random() * 100],
            executionTime: [Math.random() * 50],
            memoryUsage: [Math.random() * 80],
            cpuUtilization: [Math.random() * 90],
            errorRate: [Math.random() * 10],
            pdaValidation: [Math.random() * 100],
            accountDataMatching: [Math.random() * 100],
            cpiSafety: [Math.random() * 100],
            authorityChecks: [Math.random() * 100],
            timestamp: Date.now() + i * 1000
        });

        if (i > numPoints / 2) {
            // Introduce anomaly in all metrics
            metrics[i].instructionFrequency = [metrics[i].instructionFrequency[0] * 2];
            metrics[i].executionTime = [metrics[i].executionTime[0] * 1.5];
            metrics[i].memoryUsage = [metrics[i].memoryUsage[0] * 2];
            metrics[i].cpuUtilization = [metrics[i].cpuUtilization[0] * 1.8];
            metrics[i].errorRate = [metrics[i].errorRate[0] * 3];
            metrics[i].pdaValidation = [metrics[i].pdaValidation[0] * 0.5];
            metrics[i].accountDataMatching = [metrics[i].accountDataMatching[0] * 0.6];
            metrics[i].cpiSafety = [metrics[i].cpiSafety[0] * 0.4];
            metrics[i].authorityChecks = [metrics[i].authorityChecks[0] * 0.3];
        }
    }

    return metrics;
}
