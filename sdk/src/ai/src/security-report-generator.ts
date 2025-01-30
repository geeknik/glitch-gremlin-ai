import { VulnerabilityType } from './types.js';
import { FuzzingResult } from './types.js';

interface SecurityFinding {
    type: VulnerabilityType;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence: number;
    description: string;
    location?: string;
    recommendation?: string;
    timestamp: number;
    riskScore?: number;
    codeSnippet?: string;
    remediation?: string;
}

interface TrendData {
    timestamp: number;
    value: number;
    type: string;
    riskScore?: number;
}

export class SecurityReportGenerator {
    private findings: SecurityFinding[] = [];
    private fuzzingResults: FuzzingResult[] = [];

    public addFinding(finding: SecurityFinding): void {
        this.findings.push(finding);
    }

    public addFuzzingResult(result: FuzzingResult): void {
        this.fuzzingResults.push(result);
    }

    public generateReport(): string {
        let report = '# Security Analysis Report\n\n';

        // Add summary section
        report += this.generateSummary();

        // Add findings section
        report += this.generateFindingsSection();

        // Add trends section
        report += this.generateTrendsSection();

        // Add recommendations section
        report += this.generateRecommendations();

        return report;
    }

    private generateSummary(): string {
        const totalFindings = this.findings.length;
        const severityCount = {
            HIGH: 0,
            MEDIUM: 0,
            LOW: 0
        };

        this.findings.forEach(finding => {
            severityCount[finding.severity]++;
        });

        let summary = '## Summary\n\n';
        summary += `Total Findings: ${totalFindings}\n`;
        summary += `High Severity: ${severityCount.HIGH}\n`;
        summary += `Medium Severity: ${severityCount.MEDIUM}\n`;
        summary += `Low Severity: ${severityCount.LOW}\n\n`;

        return summary;
    }

    private generateFindingsSection(): string {
        let section = '## Security Findings\n\n';

        // Sort findings by severity
        const sortedFindings = [...this.findings].sort((a, b) => {
            const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });

        sortedFindings.forEach(finding => {
            section += `### ${finding.type}\n`;
            section += `**Severity**: ${finding.severity}\n`;
            section += `**Confidence**: ${(finding.confidence * 100).toFixed(1)}%\n`;
            section += `**Description**: ${finding.description}\n`;
            
            if (finding.location) {
                section += `**Location**: ${finding.location}\n`;
            }
            
            if (finding.recommendation) {
                section += `**Recommendation**: ${finding.recommendation}\n`;
            }

            if (finding.codeSnippet) {
                section += '\n```solidity\n';
                section += finding.codeSnippet;
                section += '\n```\n';
            }

            section += '\n';
        });

        return section;
    }

    private generateTrendsSection(): string {
        let section = '## Security Trends\n\n';

        const trends = this.analyzeTrends();
        trends.forEach(trend => {
            section += `### ${trend.type}\n`;
            section += `Value: ${trend.value}\n`;
            if (trend.riskScore !== undefined) {
                section += `Risk Score: ${trend.riskScore}\n`;
            }
            section += '\n';
        });

        return section;
    }

    private generateRecommendations(): string {
        let section = '## Recommendations\n\n';

        // Group findings by type
        const findingsByType = new Map<VulnerabilityType, SecurityFinding[]>();
        this.findings.forEach(finding => {
            const findings = findingsByType.get(finding.type) || [];
            findings.push(finding);
            findingsByType.set(finding.type, findings);
        });

        // Generate recommendations for each type
        findingsByType.forEach((findings, type) => {
            section += `### ${type}\n`;
            const uniqueRecommendations = new Set(
                findings
                    .map(f => f.recommendation)
                    .filter((r): r is string => r !== undefined)
            );
            uniqueRecommendations.forEach(rec => {
                section += `- ${rec}\n`;
            });
            section += '\n';
        });

        return section;
    }

    private analyzeTrends(): TrendData[] {
        const trends: TrendData[] = [];

        // Analyze findings over time
        const timeRanges = this.getTimeRanges();
        timeRanges.forEach(range => {
            const findingsInRange = this.findings.filter(f => 
                f.timestamp >= range.start && f.timestamp < range.end
            );

            trends.push({
                timestamp: range.start,
                value: findingsInRange.length,
                type: 'Finding Count',
                riskScore: this.calculateRiskScore(findingsInRange)
            });
        });

        return trends;
    }

    private getTimeRanges(): { start: number; end: number }[] {
        if (this.findings.length === 0) return [];

        const timestamps = this.findings.map(f => f.timestamp);
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const dayInMs = 24 * 60 * 60 * 1000;

        const ranges: { start: number; end: number }[] = [];
        for (let start = minTime; start < maxTime; start += dayInMs) {
            ranges.push({
                start,
                end: start + dayInMs
            });
        }

        return ranges;
    }

    private calculateRiskScore(findings: SecurityFinding[]): number {
        const severityWeights = {
            HIGH: 1.0,
            MEDIUM: 0.6,
            LOW: 0.3
        };

        return findings.reduce((score, finding) => {
            return score + (severityWeights[finding.severity] * finding.confidence);
        }, 0) / Math.max(findings.length, 1);
    }
}

export type { SecurityFinding, TrendData };

