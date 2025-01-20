import { VulnerabilityType } from '../../../../types.js';

export { VulnerabilityType };

export interface ChaosTestResult {
    success: boolean;
    findings: Finding[];
    metrics: TestMetrics;
}

export interface Finding {
    type: VulnerabilityType;
    description: string;
    recommendation?: string;
    mitigation?: string;
}

export interface StaticAnalysisResult {
    findings: string[];
    riskScore: number;
}

export interface DynamicAnalysisResult {
    findings: string[];
    riskScore: number;
}

export interface TestMetrics {
    totalTransactions: number;
    errorRate: number;
    avgLatency: number;
}
