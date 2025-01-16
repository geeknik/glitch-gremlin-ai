export enum TestType {
MUTATION = 'mutation',
FUZZING = 'fuzzing',
STRESS = 'stress'
}

export enum TestStatus {
PENDING = 'pending',
RUNNING = 'running',
COMPLETED = 'completed',
FAILED = 'failed'
}

export enum VulnerabilityLevel {
LOW = 'low',
MEDIUM = 'medium',
HIGH = 'high',
CRITICAL = 'critical'
}

export interface MutationTestParams {
targetProgram: string;
testType: TestType;
duration: number;
intensity: number;
}

export interface ChaosTestConfig {
cluster: string;
wallet: any;
modelPath?: string;
maxRetries?: number;
}

export interface Vulnerability {
level: VulnerabilityLevel;
description: string;
location?: string;
recommendation?: string;
metadata?: Record<string, unknown>;
}

export interface TestMetrics {
totalTransactions: number;
errorRate: number;
avgLatency: number;
cpuUtilization?: number;
memoryUsage?: number;
}

export interface MutationTestResult {
success: boolean;
vulnerabilities: Vulnerability[];
resultRef: string;
logs: string[];
metrics: TestMetrics;
duration: number;
timestamp: number;
}

export interface RequestStatus {
id: string;
status: TestStatus;
startTime: number;
endTime?: number;
params: MutationTestParams;
result?: MutationTestResult;
error?: Error;
}

export class GlitchError extends Error {
constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GlitchError';
}
}

export class ValidationError extends GlitchError {
constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
}
}

export class TimeoutError extends GlitchError {
constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
}
}

