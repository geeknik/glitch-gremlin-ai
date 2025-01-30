import { Tensor } from '@tensorflow/tfjs-node';
import { PublicKey } from '@solana/web3.js';
import { SecurityLevel, VulnerabilityType, MutationType } from '../types.js';

export interface TimeSeriesMetric {
  type: MetricType;
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
}

export enum MetricType {
  CPU_UTILIZATION = 'CPU_UTILIZATION',
  MEMORY_USAGE = 'MEMORY_USAGE',
  TRANSACTION_LATENCY = 'TRANSACTION_LATENCY',
  ERROR_RATE = 'ERROR_RATE',
  INSTRUCTION_COUNT = 'INSTRUCTION_COUNT',
  ACCOUNT_ACCESS = 'ACCOUNT_ACCESS',
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
  CRASH_COUNT = 'CRASH_COUNT'
}

export interface ModelConfig {
  inputShape: number[];
  hiddenLayers: number[];
  learningRate: number;
  epochs: number;
  batchSize: number;
  threshold: number;
}

export interface TrainingResult {
  loss: number;
  accuracy: number;
  epoch: number;
  validationLoss?: number;
  validationAccuracy?: number;
  metrics?: Record<string, number>;
}

export interface PredictionResult {
  prediction: number[];
  confidence: number;
  timestamp: number;
  details?: {
    expectedValue: number;
    actualValue: number;
    deviation: number;
  };
}

export interface ModelMetadata {
  version: string;
  createdAt: Date;
  lastTrainedAt: Date;
  metrics: {
    accuracy: number;
    loss: number;
    samples: number;
  };
  config: ModelConfig;
}

export interface DataPoint {
  features: number[];
  label: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface DataBatch {
  inputs: Tensor;
  labels: Tensor;
  metadata?: {
    batchSize: number;
    timestamp: Date;
    metrics?: Record<string, number>;
  };
}

export interface ModelCheckpoint {
  epoch: number;
  timestamp: Date;
  metrics: {
    loss: number;
    accuracy: number;
    validationLoss?: number;
    validationAccuracy?: number;
  };
  weights: Record<string, Tensor>;
}

export interface TrainingConfig extends ModelConfig {
  validationSplit?: number;
  shuffle?: boolean;
  callbacks?: {
    onEpochEnd?: (epoch: number, logs: Record<string, number>) => void;
    onBatchEnd?: (batch: number, logs: Record<string, number>) => void;
  };
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

export interface FuzzingMutation {
    type: MutationType;
    target: string;
    payload: string | number | boolean | null | Buffer | PublicKey | Record<string, any>;
    securityImpact: SecurityLevel;
    description: string;
    expectedVulnerability?: VulnerabilityType;
    metadata?: {
        instruction?: string;
        expectedValue?: string | number;
        actualValue?: string | number;
        custom?: boolean;
        timestamp?: number;
    };
}

export interface VulnerabilityAnalysis {
    type: VulnerabilityType;
    confidence: number;
    severity: SecurityLevel;
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
        exploitScenario?: string;
        recommendation: string;
        references?: string[];
    };
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

export interface ReinforcementConfig {
    learningRate: number;
    discountFactor: number;
    epsilonStart: number;
    epsilonEnd: number;
    epsilonDecay: number;
    batchSize: number;
    memorySize: number;
    targetUpdateFrequency: number;
    hiddenLayers: number[];
}

export interface MutationOperator {
    name: string;
    description: string;
    apply: (input: any) => any;
    validate: (input: any) => boolean;
}

export interface MutationStrategy extends MutationOperator {
    probability: number;
}

export interface PredictionResult {
    vulnerabilityType: VulnerabilityType;
    confidence: number;
    details?: {
        expectedValue: number;
        actualValue: number;
        deviation: number;
    };
    timestamp: number;
    modelVersion: string;
}

export interface TrainingResult {
    accuracy: number;
    loss: number;
    epochs: number;
    duration: number;
    modelVersion: string;
}

export interface AnomalyReport {
    timestamp: number;
    details: {
        expectedValue: number;
        actualValue: number;
        deviation: number;
    };
}

export interface VulnerabilityReport {
    type: VulnerabilityType;
    severity: number;
    confidence: number;
    details: string[];
    recommendations: string[];
    timestamp: number;
}
