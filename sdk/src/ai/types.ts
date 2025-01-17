export enum VulnerabilityType {
    AccessControl = 'ACCESS_CONTROL',
    ArithmeticOverflow = 'ARITHMETIC_OVERFLOW',
    Reentrancy = 'REENTRANCY',
    None = 'NONE'
}

export interface ModelOutput {
    type: VulnerabilityType;
    confidence: number;
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
