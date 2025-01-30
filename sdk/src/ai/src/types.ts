import { LayersModel } from '@tensorflow/tfjs';
import { VulnerabilityType as BaseVulnerabilityType, SecurityLevel } from '../../types.js';

// Core types for Solana security fuzzing and analysis

// Vulnerability types that can be detected during fuzzing
export const enum VulnerabilityType {
    None = 'NONE',
    ArithmeticOverflow = 'ARITHMETIC_OVERFLOW',
    AccessControl = 'ACCESS_CONTROL',
    PDASafety = 'PDA_SAFETY',
    Reentrancy = 'REENTRANCY',
    DataValidation = 'DATA_VALIDATION',
    LogicError = 'LOGIC_ERROR',
    UnhandledError = 'UNHANDLED_ERROR',
    CPISafety = 'CPI_SAFETY',
    AuthorityCheck = 'AUTHORITY_CHECK',
    AccountConfusion = 'ACCOUNT_CONFUSION',
    SignerAuthorization = 'SIGNER_AUTHORIZATION',
    ClockManipulation = 'CLOCK_MANIPULATION',
    LamportDrain = 'LAMPORT_DRAIN',
    InstructionInjection = 'INSTRUCTION_INJECTION',
    RaceCondition = 'RACE_CONDITION'
}

// Metric types for data collection and analysis
export const enum MetricType {
    PERFORMANCE = 'PERFORMANCE',
    SECURITY = 'SECURITY',
    COVERAGE = 'COVERAGE',
    RESOURCE = 'RESOURCE',
    VULNERABILITY = 'VULNERABILITY',
    TRANSACTION_LATENCY = 'TRANSACTION_LATENCY',
    ACCOUNT_ACCESS = 'ACCOUNT_ACCESS',
    CPU_UTILIZATION = 'CPU_UTILIZATION',
    MEMORY_USAGE = 'MEMORY_USAGE',
    ERROR_RATE = 'ERROR_RATE',
    INSTRUCTION_COUNT = 'INSTRUCTION_COUNT',
    CPI_CALLS = 'CPI_CALLS',
    PDA_LOOKUPS = 'PDA_LOOKUPS',
    LAMPORT_CHANGES = 'LAMPORT_CHANGES',
    EPISODE_REWARD = 'EPISODE_REWARD',
    CODE_COVERAGE = 'CODE_COVERAGE',
    UNIQUE_PATHS = 'UNIQUE_PATHS',
    VULNERABILITIES = 'VULNERABILITIES',
    SUCCESS_RATE = 'SUCCESS_RATE',
    EXPLORATION_RATE = 'EXPLORATION_RATE',
    EXECUTION_TIME = 'EXECUTION_TIME',
    CRASH_COUNT = 'CRASH_COUNT',
    DETECTION = 'DETECTION',
    FUZZING = 'FUZZING'
}

// Graph and retention options
export interface GraphOptions {
    width?: number;
    height?: number;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    showLegend?: boolean;
    colors?: string[];
}

export const enum RetentionPeriods {
    HOUR = 3600,
    DAY = 86400,
    WEEK = 604800,
    MONTH = 2592000
}

// Error types for improved error handling
export interface PredictionResult {
    vulnerabilityType: VulnerabilityType;
    confidence: number;
    details: string;
    timestamp: Date;
    modelVersion: string;
    probabilities?: number[];
    vulnerabilities?: VulnerabilityType[];
    type?: VulnerabilityType;
    prediction?: number[];
    location?: string;
    risk?: 'HIGH' | 'MEDIUM' | 'LOW';
    securityProof?: {
        hash: string;
        signature: string;
        timestamp: number;
    };
}

export interface MLConfig {
    inputShape: number[];
    hiddenLayers: number[];
    learningRate: number;
    batchSize: number;
    epochs: number;
}

export interface ModelConfig extends MLConfig {
    securityLevel: number;
    executionMode: 'sgx' | 'kvm' | 'wasm';
    timeoutMs: number;
}

export interface ModelMetrics {
    accuracy: number;
    loss: number;
    precision: number;
    recall: number;
    f1Score: number;
}

export interface TrainingResult {
    loss: number;
    accuracy: number;
    epochs: number;
    epoch: number;
    validationLoss?: number;
    validationAccuracy?: number;
    metrics?: Record<string, number>;
}

export interface MLModel {
    model: LayersModel;
    config: MLConfig;
    initialize(): Promise<void>;
    train(features: number[][], labels: number[][]): Promise<TrainingResult>;
    predict(features: number[][]): Promise<PredictionResult>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
    dispose(): Promise<void>;
    checkShape?(shape: number[]): boolean;
    add?(layer: any): void;
    pop?(): void;
    sequential?: boolean;
}

export interface VulnerabilityDetectionModel extends MLModel {
    detectVulnerability(features: number[][]): Promise<VulnerabilityType>;
    getConfidenceScore(features: number[][]): Promise<number>;
    getVulnerabilityDetails(type: VulnerabilityType): string;
    predict(features: number[][]): Promise<PredictionResult>;
    ensureInitialized(): Promise<void>;
    cleanup(): Promise<void>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
    train(features: number[][], labels: number[][]): Promise<TrainingResult>;
}

// Error types for improved error handling
export class FuzzerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FuzzerError';
    }
}

export class ValidationError extends FuzzerError {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class ResourceExhaustionError extends FuzzerError {
    constructor(message: string) {
        super(message);
        this.name = 'ResourceExhaustionError';
    }
}


// Improved validation interfaces
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface SecurityMetrics {
    coverage: number;
    uniquePaths: number;
    vulnerabilitiesFound: number;
    executionTime: number;
    memoryUsage: number;
    cpuUtilization: number;
    networkLatency: number;
    errorRate: number;
    pdaValidation: number;
    accountDataMatching: number;
    cpiSafety: number;
    authorityChecks: number;
}

export interface VulnerabilityReport {
    type: VulnerabilityType;
    severity: number;
    confidence: number;
    details: string[];
    recommendations: string[];
    timestamp: number;
}

export interface SecurityAnalysis {
    vulnerabilities: VulnerabilityReport[];
    metrics: SecurityMetrics;
    timestamp: number;
}

export interface FuzzingConfig {
    mutationRate: number;
    maxIterations: number;
    timeoutMs: number;
    concurrentExecutions: number;
    retryAttempts: number;
    minCoverage: number;
    stopOnVulnerability: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    metrics: {
        collectMemoryMetrics: boolean;
        collectCPUMetrics: boolean;
        collectNetworkMetrics: boolean;
    };
}

export interface FuzzingResult {
    success: boolean;
    vulnerabilities: BaseVulnerabilityType[];
    metrics: FuzzingMetrics;
    mutations: FuzzingMutation[];
    duration: number;
    coverage: number;
    timestamp: number;
}

export interface FuzzingState {
    programState: {
        accounts: {
            pubkey: string;
            lamports: number;
            data: Buffer;
            owner: string;
            executable: boolean;
        }[];
        slot: number;
        blockTime: number;
    };
    metrics: {
        coverage: number;
        uniquePaths: number;
        vulnerabilitiesFound: number;
        successRate: number;
        avgExecutionTime: number;
    };
    history: {
        actions: FuzzingAction[];
        rewards: number[];
        states: FuzzingState[];
    };
}

export interface FuzzingAction {
    type: 'MUTATE' | 'CROSSOVER' | 'RESET' | 'EXPLOIT';
    params: {
        targetAccounts?: string[];
        mutationRate?: number;
        exploitType?: VulnerabilityType;
        data?: Buffer;
    };
    timestamp: number;
}

export interface FuzzingReward {
    value: number;
    components: {
        coverage: number;
        vulnerabilities: number;
        uniquePaths: number;
        executionTime: number;
    };
    metadata?: {
        vulnerabilityTypes?: VulnerabilityType[];
        newPathsFound?: number;
        failureRate?: number;
    };
}

export interface FuzzingEpisode {
    startState: FuzzingState;
    actions: FuzzingAction[];
    rewards: FuzzingReward[];
    endState: FuzzingState;
    totalReward: number;
    metadata: {
        duration: number;
        successRate: number;
        vulnerabilitiesFound: VulnerabilityType[];
    };
}

export interface FuzzInput {
    data: Buffer;
    metadata: {
        type: string;
        mutationCount: number;
        timestamp?: number;
        parents?: string[];
        [key: string]: any;
    };
}

export type TestType = 'FUZZ' | 'MUTATION' | 'SYMBOLIC' | 'REINFORCEMENT';

export interface StakeInfo {
    stakeId: string;
    amount: number;
    duration: number;
    startTime: number;
    lockupEndTime: number;
    estimatedReward: number;
    status: 'ACTIVE' | 'UNSTAKED' | 'SLASHED';
}

export interface UnstakeResult {
    success: boolean;
    amount: number;
    reward: number;
    penalty?: number;
    timestamp: number;
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    instance?: any; // For testing purposes
}

export interface MetricsCollectorConfig {
    outputDir: string;
    rrdPath: string;
    updateInterval: number;
    retentionPeriods: RetentionPeriods;
    graphOptions: GraphOptions;
}

export interface TimeSeriesMetric {
    type: MetricType;
    name: string;
    value: number;
    timestamp: number;
    tags?: {
        type?: string;
        converged?: string;
        [key: string]: string | undefined;
    };
    metadata?: {
        [key: string]: unknown;
    };
}

export interface SecurityModelConfig {
    weightings: {
        [key: string]: number;
    };
    thresholds: {
        low: number;
        medium: number;
        high: number;
    };
    inputShape: number[];
    hiddenLayers: number[];
    outputShape: number[];
    learningRate: number;
    epochs?: number;
    batchSize?: number;
    modelPath?: string;
    maxRetries?: number;
}

export interface ChaosRequest {
    id: string;
    requestId: string;
    targetProgram: string;
    testType: TestType;
    params: {
        intensity: number;
        duration: number;
        securityLevel?: number;
        executionEnvironment?: string;
    };
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    createdAt: number;
    updatedAt: number;
    result?: {
        success: boolean;
        findings: Array<{
            type: VulnerabilityType;
            severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            description: string;
            location?: string;
        }>;
        metrics: {
            totalTransactions: number;
            errorRate: number;
            avgLatency: number;
        };
    };
}

export interface ModelOutput {
    prediction: number[];
    confidence: number;
    details?: string;
}

export type MutationType = 
    | 'ARITHMETIC'
    | 'ACCESS_CONTROL'
    | 'REENTRANCY'
    | 'PDA'
    | 'CONCURRENCY'
    | 'TYPE_COSPLAY'
    | 'BOUNDARY'
    | 'EXTREME'
    | 'RACE';

export interface FuzzingMutation {
    type: MutationType;
    data: Buffer;
    description: string;
    metadata?: {
        severity?: 'low' | 'medium' | 'high' | 'critical';
        probability?: number;
        impact?: number;
        targetFunction?: string;
        expectedOutcome?: string;
    };
}

export interface FuzzingScenario {
    mutations: FuzzingMutation[];
    targetProgram: string;
    expectedVulnerabilities: BaseVulnerabilityType[];
    constraints?: {
        maxExecutionTime?: number;
        maxMemoryUsage?: number;
        maxCPUUsage?: number;
    };
}

export interface FuzzingMetrics {
    coverage: number;
    uniquePaths: number;
    executionTime: number;
    memoryUsage: number;
    cpuUtilization: number;
    networkLatency: number;
    errorRate: number;
    vulnerabilitiesFound: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
}

export interface FuzzingStrategy {
    generateMutations(scenario: FuzzingScenario): FuzzingMutation[];
    evaluateMutation(mutation: FuzzingMutation): Promise<boolean>;
    optimizeMutation(mutation: FuzzingMutation, result: boolean): FuzzingMutation;
}

export interface VulnerabilityInfo {
    type: string;
    severity: SecurityLevel;
    confidence: number;
    description: string;
    evidence: string[];
    metadata?: Record<string, any>;
    location?: {
        file: string;
        startLine: number;
        endLine: number;
        function?: string;
    };
    details?: {
        impact: string;
        likelihood: string;
        recommendation: string;
    };
    references?: string[];
}
