import { TimeSeriesMetric } from '../anomaly-detection';

interface MetricsData {
    instructionFrequency: number[];
    executionTime: number[];
    memoryUsage: number[];
    cpuUtilization: number[];
    errorRate: number[];
    pdaValidation: number[];
    accountDataMatching: number[];
    cpiSafety: number[];
    authorityChecks: number[];
}

export function generateAnomalousMetrics(numPoints: number): TimeSeriesMetric[] {
    const metrics: TimeSeriesMetric[] = [];

    for (let i = 0; i < numPoints; i++) {
        const baseMetrics = {
            instructionFrequency: [Math.random() * 100],
            executionTime: [Math.random() * 50],
            memoryUsage: [Math.random() * 80],
            cpuUtilization: [Math.random() * 90],
            errorRate: [Math.random() * 10],
            pdaValidation: [Math.random() * 100],
            accountDataMatching: [Math.random() * 100],
            cpiSafety: [Math.random() * 100],
            authorityChecks: [Math.random() * 100],
        };

        metrics.push({
            timestamp: Date.now() + i * 1000,
            metrics: baseMetrics,
            metadata: {}
        });

        if (i > numPoints / 2) {
            // Introduce anomaly in all metrics
            const currentMetrics = metrics[i]?.metrics as MetricsData;
            if (currentMetrics) {
                currentMetrics.instructionFrequency = [(currentMetrics.instructionFrequency?.[0] ?? 0) * 2];
                currentMetrics.executionTime = [(currentMetrics.executionTime?.[0] ?? 0) * 1.5];
                currentMetrics.memoryUsage = [(currentMetrics.memoryUsage?.[0] ?? 0) * 2];
                currentMetrics.cpuUtilization = [(currentMetrics.cpuUtilization?.[0] ?? 0) * 1.8];
                currentMetrics.errorRate = [(currentMetrics.errorRate?.[0] ?? 0) * 3];
                currentMetrics.pdaValidation = [(currentMetrics.pdaValidation?.[0] ?? 0) * 0.5];
                currentMetrics.accountDataMatching = [(currentMetrics.accountDataMatching?.[0] ?? 0) * 0.6];
                currentMetrics.cpiSafety = [(currentMetrics.cpiSafety?.[0] ?? 0) * 0.4];
                currentMetrics.authorityChecks = [(currentMetrics.authorityChecks?.[0] ?? 0) * 0.3];
            }
        }
    }

    return metrics;
}
