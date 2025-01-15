import { TimeSeriesMetric } from '../anomaly-detection';

export function generateAnomalousMetrics(numPoints: number): TimeSeriesMetric[] {
    const metrics: TimeSeriesMetric[] = [];

    for (let i = 0; i < numPoints; i++) {
        metrics.push({
            timestamp: Date.now() + i * 1000,
            metrics: {
                instructionFrequency: [Math.random() * 100],
                executionTime: [Math.random() * 50],
                memoryUsage: [Math.random() * 80],
                cpuUtilization: [Math.random() * 90],
                errorRate: [Math.random() * 10],
                pdaValidation: [Math.random() * 100],
                accountDataMatching: [Math.random() * 100],
                cpiSafety: [Math.random() * 100],
                authorityChecks: [Math.random() * 100],
            },
            metadata: {}
        });

        if (i > numPoints / 2) {
            // Introduce anomaly in all metrics
            metrics[i].metrics.instructionFrequency = metrics[i].metrics.instructionFrequency ? [metrics[i].metrics.instructionFrequency[0] * 2] : [0];
            metrics[i].metrics.executionTime = metrics[i].metrics.executionTime ? [metrics[i].metrics.executionTime[0] * 1.5] : [0];
            metrics[i].metrics.memoryUsage = metrics[i].metrics.memoryUsage ? [metrics[i].metrics.memoryUsage[0] * 2] : [0];
            metrics[i].metrics.cpuUtilization = metrics[i].metrics.cpuUtilization ? [metrics[i].metrics.cpuUtilization[0] * 1.8] : [0];
            metrics[i].metrics.errorRate = metrics[i].metrics.errorRate ? [metrics[i].metrics.errorRate[0] * 3] : [0];
            metrics[i].metrics.pdaValidation = metrics[i].metrics.pdaValidation ? [metrics[i].metrics.pdaValidation[0] * 0.5] : [0];
            metrics[i].metrics.accountDataMatching = metrics[i].metrics.accountDataMatching ? [metrics[i].metrics.accountDataMatching[0] * 0.6] : [0];
            metrics[i].metrics.cpiSafety = metrics[i].metrics.cpiSafety ? [metrics[i].metrics.cpiSafety[0] * 0.4] : [0];
            metrics[i].metrics.authorityChecks = metrics[i].metrics.authorityChecks ? [metrics[i].metrics.authorityChecks[0] * 0.3] : [0];
        }
    }

    return metrics;
}
