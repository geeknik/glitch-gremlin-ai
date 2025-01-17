export enum VulnerabilityType {
    ArithmeticOverflow = 'ArithmeticOverflow',
    Reentrancy = 'Reentrancy',
    AccessControl = 'AccessControl',
    PDASafety = 'PDASafety'
}

export interface PredictionResult {
    type: VulnerabilityType;
    confidence: number;
    timestamp?: number;
    modelVersion?: string;
}

export interface VulnerabilityDetectionModel {
    ensureInitialized(): Promise<void>;
    predict(features: number[]): Promise<PredictionResult>;
    cleanup(): Promise<void>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
}

export interface VulnerabilityDetectionModel {
    ensureInitialized(): Promise<void>;
    predict(features: number[]): Promise<PredictionResult>;
    cleanup(): Promise<void>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
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

export enum VulnerabilityType {
    ArithmeticOverflow = 'ArithmeticOverflow',
    AccessControl = 'AccessControl',
    PDASafety = 'PDASafety',
    ResourceExhaustion = 'ResourceExhaustion',
    OutOfBounds = 'OutOfBounds',
    None = 'None',
    Reentrancy = 'Reentrancy',
    AccountDataValidation = 'AccountDataValidation',
    UnhandledError = 'UnhandledError'
}

// Improved validation interfaces
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface SecurityMetrics {
    pdaValidation: number[];
    accountDataMatching: number[];
    cpiSafety: number[];
    authorityChecks: number[];
    instructionFrequency: number[];
}

export interface ModelParameters {
    inputDimension: number;
    hiddenLayers: number[];
    learningRate: number;
    dropoutRate: number;
}

export interface TrainingConfig {
    epochs: number;
    batchSize: number;
    validationSplit: number;
    patience?: number;
}

export interface TensorShape {
    dimensions: number[];
    validate(): ValidationResult;
}

export interface ResourceManager {
    acquire(): Promise<void>;
    release(): Promise<void>;
    isAcquired: boolean;
    memoryUsage: number;
}

export interface MetricsCollector {
    collect(): Promise<void>;
    stop(): Promise<void>;
    reset(): Promise<void>;
    getMetrics(): Promise<{ [key: string]: number }>;
    recordMetric(name: string, value: number): void;
}

export interface FuzzConfig {
    maxIterations: number;
    timeoutMs: number;
    memoryLimitMb: number;
    strategies: string[];
    cleanup: boolean;
    validateShapes: boolean;
    collectMetrics: boolean;
}

export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}

export interface FuzzContext {
    resourceManager: ResourceManager;
    metricsCollector: MetricsCollector;
    config: FuzzConfig;
    logger: Logger;
}

export interface TimeSeriesMetric {
    timestamp: number;
    metrics: {
        memoryUsage?: number[];
        cpuUtilization?: number[];
        errorRate?: number[];
        pdaValidation?: number[];
        accountDataMatching?: number[];
        cpiSafety?: number[];
        authorityChecks?: number[];
        instructionFrequency?: number[];
        executionTime?: number[];
    };
    metadata?: {
        [key: string]: unknown;
    };
}

export interface FuzzInput {
    instruction: number;
    data: Buffer;
    probability: number;
    metadata: Record<string, any>;
    created: number;
    type?: string;
}

export interface FuzzResult {
    type: VulnerabilityType;
    confidence: number;
    details: string;
}

export interface SecurityMetric {
    score: number;
    details: string[];
    location?: string;
}

export interface SecurityMetrics {
    arithmetic?: SecurityMetric;
    input?: SecurityMetric;
}

export interface SecurityPattern {
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    details: string[];
}

export interface SecurityScore {
    score: number;
    weight: number;
    risk: 'HIGH' | 'MEDIUM' | 'LOW';
    details?: string[];
    location?: string;
    overallScore?: number;
}

export interface FuzzingResult {
    type: string;
    details: string[];
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
}
