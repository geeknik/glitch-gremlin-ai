export enum VulnerabilityType {
    ArithmeticOverflow = 'ArithmeticOverflow',
    AccessControl = 'AccessControl',
    None = 'None', 
    Reentrancy = 'Reentrancy',
    PDASafety = 'PDASafety',
    AccountDataValidation = 'AccountDataValidation'
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
