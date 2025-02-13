import { PublicKey } from '@solana/web3.js';

// Vulnerability Types
export enum VulnerabilityType {
  Reentrancy = 'reentrancy',
  ArithmeticOverflow = 'arithmetic-overflow',
  AccessControl = 'access-control',
  RaceCondition = 'race-condition',
  InstructionInjection = 'instruction-injection',
  AccountConfusion = 'account-confusion',
  SignerAuthorization = 'signer-authorization',
  PdaValidation = 'pda-validation',
  ClockManipulation = 'clock-manipulation'
}

// Proposal States
export enum ProposalState {
  Draft = 'draft',
  Active = 'active',
  Succeeded = 'succeeded',
  Defeated = 'defeated',
  Executed = 'executed',
  Cancelled = 'cancelled'
}

// Test Types
export enum TestType {
  MUTATION = 'mutation',
  FUZZING = 'fuzzing',
  STRESS = 'stress',
  EXPLOIT = 'exploit',
  LOAD = 'load'
}

// Test Status
export enum TestStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// Vulnerability Severity Levels
export enum VulnerabilityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Chaos Request Status
export enum ChaosRequestStatus {
  Pending = 'pending',
  InProgress = 'in-progress',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled'
}

// Chaos Request Account
export interface ChaosRequestAccount {
  id: PublicKey;
  requestor: PublicKey;
  targetProgram: PublicKey;
  testType: TestType;
  duration: number;
  tokens: number;
  status: ChaosRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  result?: ChaosTestResult;
}

// Test Parameters
export interface ChaosTestParams {
  targetProgram: PublicKey;
  testType: TestType;
  duration: number;
  intensity: number;
  securityLevel: VulnerabilityLevel;
}

// Test Configuration
export interface ChaosTestConfig {
  cluster: string;
  wallet: PublicKey;
  modelPath?: string;
  maxRetries?: number;
  timeout?: number;
}

// Vulnerability Details
export interface Vulnerability {
  type: VulnerabilityType;
  level: VulnerabilityLevel;
  description: string;
  location?: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
}

// Test Metrics
export interface TestMetrics {
  totalTransactions: number;
  errorRate: number;
  avgLatency: number;
  cpuUtilization?: number;
  memoryUsage?: number;
  computeUnitsUsed: number;
  computeUnitsRemaining: number;
}

// Test Results
export interface ChaosTestResult {
  success: boolean;
  vulnerabilities: Vulnerability[];
  resultRef: string;
  logs: string[];
  metrics: TestMetrics;
  duration: number;
  timestamp: number;
}

// Request Status
export interface RequestStatus {
  id: string;
  status: TestStatus;
  startTime: number;
  endTime?: number;
  params: ChaosTestParams;
  result?: ChaosTestResult;
  error?: Error;
}

// Error Classes
export class GlitchError extends Error {
  constructor(message: string) {
    super(message);
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

export class SecurityError extends GlitchError {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// Redis Queue Types
export interface ChaosQueueItem {
  requestId: string;
  targetProgram: string;
  testType: TestType;
  priority: number;
  timestamp: number;
}

