import { TimeSeriesAnalysis } from './time-series-analysis';
import { MetricVisualization } from './metric-visualization';

interface SecurityMetric {
timestamp: Date;
metricType: string;
value: number;
metadata?: Record<string, any>;
}

interface PerformanceMetric extends SecurityMetric {
executionTime: number;
resourceUsage: {
    cpu: number;
    memory: number;
};
}

interface DetectionMetric extends SecurityMetric {
truePositives: number;
falsePositives: number;
trueNegatives: number;
falseNegatives: number;
}

interface FuzzingMetric extends SecurityMetric {
totalExecutions: number;
uniqueCrashes: number;
codeCoverage: number;
newPaths: number;
}

class SecurityMetricsCollector {
private metrics: SecurityMetric[] = [];
private timeSeriesAnalyzer: TimeSeriesAnalysis;
private visualizer: MetricVisualization;

constructor() {
    this.timeSeriesAnalyzer = new TimeSeriesAnalysis();
    this.visualizer = new MetricVisualization();
}

public collectPerformanceMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    this.analyzeResourceUtilization(metric);
}

public collectDetectionMetric(metric: DetectionMetric): void {
    this.metrics.push(metric);
    this.analyzeDetectionAccuracy(metric);
}

public collectFuzzingMetric(metric: FuzzingMetric): void {
    this.metrics.push(metric);
    this.analyzeFuzzingPerformance(metric);
}

private analyzeDetectionAccuracy(metric: DetectionMetric): void {
    const precision = metric.truePositives / (metric.truePositives + metric.falsePositives);
    const recall = metric.truePositives / (metric.truePositives + metric.falseNegatives);
    const f1Score = 2 * (precision * recall) / (precision + recall);

    this.timeSeriesAnalyzer.addDataPoint('accuracy', {
    timestamp: metric.timestamp,
    precision,
    recall,
    f1Score
    });
}

private analyzeResourceUtilization(metric: PerformanceMetric): void {
    const efficiency = this.calculateEfficiencyScore(metric);
    
    this.timeSeriesAnalyzer.addDataPoint('resources', {
    timestamp: metric.timestamp,
    efficiency,
    cpu: metric.resourceUsage.cpu,
    memory: metric.resourceUsage.memory
    });
}

private analyzeFuzzingPerformance(metric: FuzzingMetric): void {
    const effectiveness = this.calculateFuzzingEffectiveness(metric);
    
    this.timeSeriesAnalyzer.addDataPoint('fuzzing', {
    timestamp: metric.timestamp,
    effectiveness,
    coverage: metric.codeCoverage,
    uniqueFindings: metric.uniqueCrashes
    });
}

private calculateEfficiencyScore(metric: PerformanceMetric): number {
    return 1 - (metric.resourceUsage.cpu * 0.5 + metric.resourceUsage.memory * 0.5);
}

private calculateFuzzingEffectiveness(metric: FuzzingMetric): number {
    return (metric.uniqueCrashes * metric.codeCoverage) / metric.totalExecutions;
}

public generateOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const recentMetrics = this.getRecentMetrics(24); // Last 24 hours

    const avgCpuUsage = this.calculateAverageResourceUsage(recentMetrics, 'cpu');
    const avgMemoryUsage = this.calculateAverageResourceUsage(recentMetrics, 'memory');

    if (avgCpuUsage > 0.8) {
    recommendations.push('Consider scaling horizontally to distribute CPU load');
    }

    if (avgMemoryUsage > 0.8) {
    recommendations.push('Memory usage is high - consider increasing memory allocation');
    }

    return recommendations;
}

public generateMetricsDashboard(): void {
    const timeSeriesData = this.timeSeriesAnalyzer.getAnalyzedData();
    this.visualizer.createDashboard({
    accuracyTrends: timeSeriesData.accuracy,
    resourceUtilization: timeSeriesData.resources,
    fuzzingPerformance: timeSeriesData.fuzzing
    });
}

private getRecentMetrics(hours: number): SecurityMetric[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metrics.filter(metric => metric.timestamp >= cutoff);
}

private calculateAverageResourceUsage(metrics: SecurityMetric[], resource: 'cpu' | 'memory'): number {
    const performanceMetrics = metrics.filter((m): m is PerformanceMetric => 'resourceUsage' in m);
    if (performanceMetrics.length === 0) return 0;

    const sum = performanceMetrics.reduce((acc, metric) => acc + metric.resourceUsage[resource], 0);
    return sum / performanceMetrics.length;
}

public getMetricsReport(): string {
    const recentMetrics = this.getRecentMetrics(24);
    const recommendations = this.generateOptimizationRecommendations();
    
    return JSON.stringify({
    metrics: recentMetrics,
    recommendations,
    analysis: this.timeSeriesAnalyzer.getAnalyzedData()
    }, null, 2);
}
}

export default SecurityMetricsCollector;

