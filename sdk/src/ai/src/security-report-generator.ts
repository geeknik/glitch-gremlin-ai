import { VulnerabilityType } from './vulnerability-detection';
import { FuzzingResult } from './chaos-fuzz';

interface SecurityFinding {
    id: string;
    type: VulnerabilityType;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    location?: {
        file: string;
        lineNumber: number;
    };
    remediation: string;
    codeSnippet?: string;
    riskScore: number;
}

interface TrendData {
    timestamp: Date;
    vulnerabilityCount: number;
    severityDistribution: Record<string, number>;
    riskScore: number;
}

class SecurityReportGenerator {
    private findings: SecurityFinding[] = [];
    private fuzzingResults: FuzzingResult[] = [];
    private trendData: TrendData[] = [];

    constructor() {}

    public addFinding(finding: SecurityFinding): void {
        this.findings.push(finding);
    }

    public addFuzzingResult(result: FuzzingResult): void {
        this.fuzzingResults.push(result);
    }

    public addTrendData(data: TrendData): void {
        this.trendData.push(data);
    }

    private calculateRiskScore(): number {
        const severityWeights = {
            CRITICAL: 10,
            HIGH: 7,
            MEDIUM: 4,
            LOW: 1
        };

        return this.findings.reduce((score, finding) => 
            score + severityWeights[finding.severity] * finding.riskScore, 0);
    }

    private generateRemediation(): string[] {
        return this.findings.map(finding => {
            return `## ${finding.type} (${finding.severity})
            ${finding.description}
            
            ### Remediation Steps
            ${finding.remediation}
            
            ${finding.codeSnippet ? `### Code Fix\n\`\`\`typescript\n${finding.codeSnippet}\n\`\`\``: ''}`;
        });
    }

    private analyzeTrends(): string {
        const trendAnalysis = this.trendData
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        return `## Vulnerability Trends
            - Current Risk Score: ${this.calculateRiskScore()}
            - Trend Direction: ${this.calculateTrendDirection(trendAnalysis)}
            - Critical Findings: ${this.countSeverity('CRITICAL')}
            - High Severity: ${this.countSeverity('HIGH')}
            - Medium Severity: ${this.countSeverity('MEDIUM')}
            - Low Severity: ${this.countSeverity('LOW')}`;
    }

    private countSeverity(severity: string): number {
        return this.findings.filter(f => f.severity === severity).length;
    }

    private calculateTrendDirection(trends: TrendData[]): string {
        if (trends.length < 2) return 'Insufficient data';
        const recent = trends[trends.length - 1].riskScore;
        const previous = trends[trends.length - 2].riskScore;
        return recent > previous ? 'Increasing' : 'Decreasing';
    }

    public generateMarkdownReport(): string {
        return `# Security Analysis Report
        ${new Date().toISOString()}

        ## Executive Summary
        Total Vulnerabilities: ${this.findings.length}
        Overall Risk Score: ${this.calculateRiskScore()}
        
        ${this.analyzeTrends()}

        ## Detailed Findings
        ${this.generateRemediation().join('\n\n')}

        ## Fuzzing Campaign Results
        Total Fuzzing Tests: ${this.fuzzingResults.length}
        Failed Tests: ${this.fuzzingResults.filter(r => !r.success).length}`;
    }

    public generateJsonReport(): string {
        return JSON.stringify({
            timestamp: new Date(),
            findings: this.findings,
            riskScore: this.calculateRiskScore(),
            trendAnalysis: {
                data: this.trendData,
                direction: this.calculateTrendDirection(this.trendData)
            },
            fuzzingResults: this.fuzzingResults
        }, null, 2);
    }

    public generateHtmlReport(): string {
        const markdown = this.generateMarkdownReport();
        // Convert markdown to HTML (implement or use a library)
        return `<!DOCTYPE html>
        <html>
            <head>
                <title>Security Analysis Report</title>
                <style>
                    body { font-family: Arial, sans-serif; }
                    .severity-critical { color: #ff0000; }
                    .severity-high { color: #ff6600; }
                    .severity-medium { color: #ffcc00; }
                    .severity-low { color: #00cc00; }
                </style>
            </head>
            <body>
                ${this.convertMarkdownToHtml(markdown)}
            </body>
        </html>`;
    }

    private convertMarkdownToHtml(markdown: string): string {
        // Implement markdown to HTML conversion
        return markdown.replace(/\n/g, '<br>');
    }
}

export { SecurityReportGenerator, SecurityFinding, TrendData };

