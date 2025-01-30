import { TimeSeriesMetric, MetricType } from '../types.js';

export class TimeSeriesAnalysis {
    private metrics: Map<MetricType, TimeSeriesMetric[]> = new Map();

    public addMetric(metric: TimeSeriesMetric): void {
        if (!this.metrics.has(metric.type)) {
            this.metrics.set(metric.type, []);
        }
        this.metrics.get(metric.type)!.push(metric);
    }

    public getMetrics(type: MetricType): TimeSeriesMetric[] {
        return this.metrics.get(type) || [];
    }

    public calculateMovingAverage(type: MetricType, windowSize: number): number[] {
        const metrics = this.getMetrics(type);
        const values = metrics.map(m => m.value);
        const result: number[] = [];

        for (let i = 0; i <= values.length - windowSize; i++) {
            const window = values.slice(i, i + windowSize);
            const average = window.reduce((a, b) => a + b) / windowSize;
            result.push(average);
        }

        return result;
    }

    public calculateStandardDeviation(type: MetricType): number {
        const metrics = this.getMetrics(type);
        const values = metrics.map(m => m.value);
        
        if (values.length === 0) return 0;
        
        const mean = values.reduce((a, b) => a + b) / values.length;
        const squareDiffs = values.map(value => {
            const diff = value - mean;
            return diff * diff;
        });
        
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    public detectAnomalies(type: MetricType, zScoreThreshold: number = 2): TimeSeriesMetric[] {
        const metrics = this.getMetrics(type);
        const values = metrics.map(m => m.value);
        const mean = values.reduce((a, b) => a + b) / values.length;
        const stdDev = this.calculateStandardDeviation(type);

        return metrics.filter(metric => {
            const zScore = Math.abs((metric.value - mean) / stdDev);
            return zScore > zScoreThreshold;
        });
    }

    public calculateTrend(type: MetricType, period: number = 10): {
        slope: number;
        intercept: number;
        r2: number;
    } {
        const metrics = this.getMetrics(type);
        if (metrics.length < 2) {
            return { slope: 0, intercept: 0, r2: 0 };
        }

        const x = Array.from({ length: metrics.length }, (_, i) => i);
        const y = metrics.map(m => m.value);

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = metrics.length;

        for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumX2 += x[i] * x[i];
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate R-squared
        const yMean = sumY / n;
        let totalSS = 0, residualSS = 0;

        for (let i = 0; i < n; i++) {
            totalSS += Math.pow(y[i] - yMean, 2);
            residualSS += Math.pow(y[i] - (slope * x[i] + intercept), 2);
        }

        const r2 = 1 - (residualSS / totalSS);

        return { slope, intercept, r2 };
    }

    public getStatistics(type: MetricType): {
        mean: number;
        median: number;
        min: number;
        max: number;
        stdDev: number;
        count: number;
    } {
        const metrics = this.getMetrics(type);
        const values = metrics.map(m => m.value);
        
        if (values.length === 0) {
            return {
                mean: 0,
                median: 0,
                min: 0,
                max: 0,
                stdDev: 0,
                count: 0
            };
        }

        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b) / values.length;
        const median = values.length % 2 === 0
            ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
            : sorted[Math.floor(values.length / 2)];

        return {
            mean,
            median,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            stdDev: this.calculateStandardDeviation(type),
            count: values.length
        };
    }

    public clear(): void {
        this.metrics.clear();
    }
} 