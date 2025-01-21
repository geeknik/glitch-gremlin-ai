
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

export interface VulnerabilityDetectionModel {
    ensureInitialized(): Promise<void>;
    predict(input: number[]): Promise<PredictionResult>;
    cleanup(): Promise<void>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
}

export interface TrainingResult {
    loss: number;
    metrics?: Record<string, number>;
}

export interface TimeSeriesMetric {
    timestamp: number;
    value: number;
    type: string;
}

export interface ModelConfig {
    windowSize: number;
    threshold: number;
    learningRate: number;
    epochs: number;
}

export interface PredictionResult {
    type: VulnerabilityType;
    confidence: number;
    timestamp: number;
    modelVersion: string;
    details: string[];
}

export interface AnomalyResult {
    isAnomaly: boolean;
    confidence: number;
    details?: string;
}

export interface FuzzingState {
    programCounter: number;
    coverage: number[];
    lastCrash: Date | null;
    mutationHistory: string[];
    executionTime: number;
}
