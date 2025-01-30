import { TimeSeriesMetric, MetricType } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface GraphOptions {
    width: number;
    height: number;
    colors: {
        background: string;
        grid: string;
        text: string;
        line: string[];
    };
}

export class MetricVisualization {
    private readonly options: GraphOptions;

    constructor(options: GraphOptions) {
        this.options = options;
    }

    public async createDashboard(
        metricsMap: Map<MetricType, TimeSeriesMetric[]>,
        outputDir: string
    ): Promise<void> {
        const dashboardHtml = this.generateDashboardHtml(metricsMap);
        const dashboardPath = path.join(outputDir, 'dashboard.html');
        await fs.writeFile(dashboardPath, dashboardHtml, 'utf-8');
    }

    private generateDashboardHtml(metricsMap: Map<MetricType, TimeSeriesMetric[]>): string {
        const sections = Array.from(metricsMap.entries()).map(([type, metrics]) => {
            return this.generateMetricSection(type, metrics);
        });

        return `
<!DOCTYPE html>
<html>
<head>
    <title>Security Metrics Dashboard</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .metric-section {
            background-color: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .metric-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .metric-title {
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }
        .metric-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin-bottom: 15px;
        }
        .stat-item {
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
        }
        .stat-value {
            font-size: 16px;
            font-weight: bold;
            color: #333;
        }
    </style>
</head>
<body>
    <h1>Security Metrics Dashboard</h1>
    ${sections.join('\n')}
    <script>
        function updateDashboard() {
            fetch('/api/metrics')
                .then(response => response.json())
                .then(data => {
                    // Update metrics
                })
                .catch(error => console.error('Error updating dashboard:', error));
        }
        // Update every minute
        setInterval(updateDashboard, 60000);
    </script>
</body>
</html>`;
    }

    private generateMetricSection(type: MetricType, metrics: TimeSeriesMetric[]): string {
        const stats = this.calculateStats(metrics);
        const plotData = this.preparePlotData(metrics);

        return `
<div class="metric-section">
    <div class="metric-header">
        <div class="metric-title">${type}</div>
    </div>
    <div class="metric-stats">
        <div class="stat-item">
            <div class="stat-label">Current Value</div>
            <div class="stat-value">${stats.current.toFixed(2)}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Average</div>
            <div class="stat-value">${stats.average.toFixed(2)}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Min</div>
            <div class="stat-value">${stats.min.toFixed(2)}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Max</div>
            <div class="stat-value">${stats.max.toFixed(2)}</div>
        </div>
    </div>
    <div id="plot-${type}" style="width: 100%; height: 300px;"></div>
    <script>
        Plotly.newPlot('plot-${type}', ${JSON.stringify(plotData.traces)}, ${JSON.stringify(plotData.layout)});
    </script>
</div>`;
    }

    private calculateStats(metrics: TimeSeriesMetric[]): {
        current: number;
        average: number;
        min: number;
        max: number;
    } {
        if (metrics.length === 0) {
            return { current: 0, average: 0, min: 0, max: 0 };
        }

        const values = metrics.map(m => m.value);
        return {
            current: values[values.length - 1],
            average: values.reduce((a, b) => a + b) / values.length,
            min: Math.min(...values),
            max: Math.max(...values)
        };
    }

    private preparePlotData(metrics: TimeSeriesMetric[]): {
        traces: any[];
        layout: any;
    } {
        const timestamps = metrics.map(m => new Date(m.timestamp).toISOString());
        const values = metrics.map(m => m.value);

        return {
            traces: [{
                x: timestamps,
                y: values,
                type: 'scatter',
                mode: 'lines',
                name: metrics[0]?.type || 'Metric',
                line: {
                    color: this.options.colors.line[0],
                    width: 2
                }
            }],
            layout: {
                showlegend: true,
                plot_bgcolor: this.options.colors.background,
                paper_bgcolor: this.options.colors.background,
                font: {
                    color: this.options.colors.text
                },
                xaxis: {
                    gridcolor: this.options.colors.grid,
                    title: 'Time'
                },
                yaxis: {
                    gridcolor: this.options.colors.grid,
                    title: 'Value'
                },
                margin: { t: 30, b: 40, l: 60, r: 10 }
            }
        };
    }
} 