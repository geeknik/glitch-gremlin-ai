export interface TimeSeriesMetric {
  // General performance metrics
  instructionFrequency: number[];
  executionTime: number[];
  memoryUsage: number[];
  cpuUtilization: number[];
  errorRate: number[];
  
  // Solana-specific security metrics
  pdaValidation: number[];
  accountDataMatching: number[];
  cpiSafety: number[];
  authorityChecks: number[];
  
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface SolanaWeights {
  pdaValidation: number;
  accountDataMatching: number;
  cpiSafety: number;
  authorityChecks: number;
}

export interface DetectorConfig {
  windowSize?: number;
  zScoreThreshold?: number;
  minSampleSize?: number;
  epochs?: number;
  solanaWeights?: SolanaWeights;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  confidence: number;
  details?: string;
  metricWeights: SolanaWeights;
  zScores: Record<keyof SolanaWeights, number>;
}

export enum VulnerabilityType {
  ArithmeticOverflow = 'ArithmeticOverflow',
  AccessControl = 'AccessControl',
  Reentrancy = 'Reentrancy',
  PDASafety = 'PDASafety',
  CPISafety = 'CPISafety',
  AuthorityCheck = 'AuthorityCheck'
}
