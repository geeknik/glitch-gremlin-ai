export interface AnalysisResult {
vulnerabilities: string[];
riskScore: number;
recommendations: string[];
}

export interface TestMetrics {
totalTransactions: number;
errorRate: number;
avgLatency: number;
}

export interface StaticAnalysisResult {
findings: string[];
riskScore: number;
}

export interface DynamicAnalysisResult {
findings: string[];
riskScore: number;
}

export interface Finding {
type: string;
recommendation?: string;
mitigation?: string;
}

export interface ChaosTestResult {
success: boolean;
findings: string[];
metrics: TestMetrics;
}

