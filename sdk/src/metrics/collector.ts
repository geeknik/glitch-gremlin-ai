export class MetricsCollector {
    recordMetric(name: string, data?: any): void {
        // Mock implementation for testing
        console.log(`Recording metric ${name}:`, data);
    }
}
