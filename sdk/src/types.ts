import { RedisKey, Redis } from 'ioredis';
import { PublicKey, Keypair, Connection, TransactionInstruction } from '@solana/web3.js';
import type { RedisOptions } from 'ioredis';
import { Tensor } from '@tensorflow/tfjs-node';
import { ErrorCode } from './errors.js';

export enum TestType {
    NETWORK_LATENCY = 'NETWORK_LATENCY',
    PACKET_LOSS = 'PACKET_LOSS',
    MEMORY_PRESSURE = 'MEMORY_PRESSURE',
    CPU_PRESSURE = 'CPU_PRESSURE',
    DISK_PRESSURE = 'DISK_PRESSURE',
    FUZZ = 'FUZZ',
    CONCURRENCY = 'CONCURRENCY'
}

export type SecurityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export enum VulnerabilityType {
    // Core Security Vulnerabilities
    Reentrancy = 'REENTRANCY',
    ArithmeticOverflow = 'ARITHMETIC_OVERFLOW',
    AccessControl = 'ACCESS_CONTROL',
    PDASafety = 'PDA_SAFETY',
    CPISafety = 'CPI_SAFETY',
    SignerAuthorization = 'SIGNER_AUTHORIZATION',
    AuthorityCheck = 'AUTHORITY_CHECK',
    
    // Data Validation
    DataValidation = 'DATA_VALIDATION',
    AccountValidation = 'ACCOUNT_VALIDATION',
    CPIValidation = 'CPI_VALIDATION',
    AuthorityValidation = 'AUTHORITY_VALIDATION',
    SignerValidation = 'SIGNER_VALIDATION',
    PDAValidation = 'PDA_VALIDATION',
    
    // Advanced Attack Vectors
    AccountConfusion = 'ACCOUNT_CONFUSION',
    ClockManipulation = 'CLOCK_MANIPULATION',
    StateConsistency = 'STATE_CONSISTENCY',
    LamportDrain = 'LAMPORT_DRAIN',
    InstructionInjection = 'INSTRUCTION_INJECTION',
    RaceCondition = 'RACE_CONDITION',
    
    // Program-Specific Vulnerabilities
    ComputeBudget = 'COMPUTE_BUDGET',
    TokenValidation = 'TOKEN_VALIDATION',
    TimelockBypass = 'TIMELOCK_BYPASS',
    QuorumManipulation = 'QUORUM_MANIPULATION',
    DelegateAbuse = 'DELEGATE_ABUSE',
    TreasuryDrain = 'TREASURY_DRAIN',
    
    // Custom
    Custom = 'CUSTOM'
}

export interface VulnerabilityInfo {
    id: string;
    name: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
    evidence: string[];
    recommendation: string;
    vulnerabilityType: VulnerabilityType;
    details: {
        expectedValue?: string | number;
        actualValue?: string | number;
        location?: string;
        impact?: string;
        likelihood?: string;
    };
}

export enum MutationType {
    // Core Mutation Types
    Arithmetic = 'ARITHMETIC',
    AccessControl = 'ACCESS_CONTROL',
    Reentrancy = 'REENTRANCY',
    PDA = 'PDA',
    Concurrency = 'CONCURRENCY',
    
    // Data Validation Mutations
    DataValidation = 'DATA_VALIDATION',
    AccountValidation = 'ACCOUNT_VALIDATION',
    CPIValidation = 'CPI_VALIDATION',
    AuthorityValidation = 'AUTHORITY_VALIDATION',
    SignerValidation = 'SIGNER_VALIDATION',
    
    // Advanced Mutation Types
    TypeCosplay = 'TYPE_COSPLAY',
    Boundary = 'BOUNDARY',
    Extreme = 'EXTREME',
    Race = 'RACE',
    Custom = 'CUSTOM'
}

export interface FuzzingMutation {
    type: MutationType;
    target: string;
    payload: string | number | boolean | null;
    securityImpact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
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

export interface FuzzingConfig {
    // Core fuzzing parameters
    mutationRate: number;
    crossoverRate: number;
    populationSize: number;
    maxGenerations: number;
    maxIterations?: number;
    
    // Security parameters
    targetVulnerabilities: VulnerabilityType[];
    securityContext: SecurityContext;
    securityLevel: number;
    selectionPressure?: number;
    
    // Execution parameters
    executionEnvironment?: 'sgx' | 'kvm' | 'wasm';
    timeoutMs?: number;
    
    // Custom configuration
    customMutations?: FuzzingMutation[];
    mutationTypes?: MutationType[];
    
    // Advanced options
    reinforcementConfig?: {
        learningRate: number;
        discountFactor: number;
        explorationRate: number;
        batchSize: number;
    };
    
    // Resource limits
    resourceLimits?: {
        maxMemoryMb: number;
        maxCpuTimeMs: number;
        maxInstructions: number;
        maxTransactions: number;
    };
}

export interface FuzzingMetrics {
    // Core metrics
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalTests: number;
    executionTime: number;
    errorRate: number;
    coverage: number;
    
    // Security metrics
    vulnerabilitiesFound: VulnerabilityType[];
    securityScore: number;
    riskLevel: SecurityLevel;
    
    // Performance metrics
    averageExecutionTime: number;
    peakMemoryUsage: number;
    cpuUtilization: number;
    
    // Advanced metrics
    uniquePaths: number;
    edgeCoverage: number;
    mutationEfficiency: number;
}

export interface FuzzingResult {
    success: boolean;
    vulnerabilities: VulnerabilityInfo[];
    expectedVulnerabilities: VulnerabilityInfo[];
    metrics: FuzzingMetrics;
    error?: Error;
}

export interface FuzzingScenario {
    name: string;
    description: string;
    config: FuzzingConfig;
    mutations: FuzzingMutation[];
    expectedVulnerabilities: VulnerabilityInfo[];
}

export interface ModelConfig {
    modelPath?: string;
    epochs?: number;
    batchSize?: number;
    learningRate?: number;
    validationSplit?: number;
    modelVersion?: string;
    inputShape?: number[];
    outputShape?: number[];
    hiddenLayers?: number[];
    activationFunction?: string;
    optimizer?: string;
    loss?: string;
    metrics?: string[];
}

export interface ModelMetadata {
    id: string;
    createdAt: Date;
    lastTrainedAt: Date;
    modelVersion: string;
    accuracy: number;
    loss: number;
    totalSamples: number;
    epochs: number;
    duration: number;
}

export interface PredictionResult {
    confidence: number;
    vulnerabilityType: VulnerabilityType;
    vulnerabilityInfo?: VulnerabilityInfo;
    metadata?: ModelMetadata;
}

export interface TrainingResult {
    success: boolean;
    accuracy: number;
    loss: number;
    epochs: number;
    duration: number;
    modelVersion: string;
    metadata: ModelMetadata;
}

export interface ChaosTesterConfig {
    connection: {
        endpoint: string;
        commitment?: string;
    };
    programId: string;
    securityLevel: SecurityLevel;
    redis?: {
        host: string;
        port: number;
        password?: string;
    };
    model?: ModelConfig;
}

export enum ProposalState {
    Draft = 'Draft',
    Active = 'Active',
    Succeeded = 'Succeeded',
    Failed = 'Failed',
    Executed = 'Executed',
    Cancelled = 'Cancelled'
}

export interface SDKConfig {
    cluster?: string;
    connection: Connection;
    wallet: any; // Replace with proper wallet type
    programId?: PublicKey;
    redisConfig?: RedisOptions;
    redis?: {
        host: string;
        port: number;
        password?: string;
        db?: number;
        keyPrefix?: string;
    };
    governanceConfig?: Partial<GovernanceConfig>;
    heliusApiKey?: string;
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    retryStrategy?: (times: number) => number | null;
}

export type RedisClient = Redis;

export interface MockRedisClient {
    connected: boolean;
    incr(key: RedisKey): Promise<number>;
    expire(key: RedisKey, seconds: number): Promise<number>;
    get(key: RedisKey): Promise<string | null>;
    set(key: RedisKey, value: string): Promise<'OK'>;
    on(event: string, callback: Function): this;
    quit(): Promise<'OK'>;
    disconnect(): Promise<void>;
    connect(): Promise<void>;
    flushall(): Promise<'OK'>;
    hset(key: RedisKey, field: string, value: string): Promise<number>;
    hget(key: RedisKey, field: string): Promise<string | null>;
    lpush(key: RedisKey, value: string): Promise<number>;
    rpop(key: RedisKey): Promise<string | null>;
}

export interface GovernanceConfig {
    // Core Configuration
    programId: PublicKey;
    treasuryAddress: PublicKey;
    
    // Staking Parameters
    minStakeAmount: number;
    maxStakeAmount: number;
    minUnstakeAmount: number;
    maxUnstakeAmount: number;
    minStakeDuration: number;
    maxStakeDuration: number;
    earlyUnstakePenalty: number;
    rewardRate: number;
    stakeLockupPeriod: number;
    
    // Governance Parameters
    minProposalStake: number;
    votingPeriod: number;
    quorum: number;
    quorumPercentage: number;
    executionDelay: number;
    emergencyQuorum: number;
    proposalThreshold: number;
    votingThreshold: number;
    proposalExecutionThreshold: number;
    proposalCooldownPeriod: number;
    
    // Security Features
    treasuryGuards: boolean;
    delegateValidation: boolean;
    timelockDuration: number;
    maxConcurrentProposals: number;
    
    // Voting Configuration
    voteWeights: {
        yes: number;
        no: number;
        abstain: number;
    };
}

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
    // Core Configuration
    programId: new PublicKey('11111111111111111111111111111111'),
    treasuryAddress: new PublicKey('11111111111111111111111111111111'),
    
    // Staking Parameters
    minStakeAmount: 1_000_000,        // 1 GREMLINAI
    maxStakeAmount: 1_000_000_000,    // 1000 GREMLINAI
    minUnstakeAmount: 1_000_000,      // 1 GREMLINAI
    maxUnstakeAmount: 1_000_000_000,  // 1000 GREMLINAI
    minStakeDuration: 86_400,         // 1 day
    maxStakeDuration: 31_536_000,     // 1 year
    earlyUnstakePenalty: 0.1,         // 10% penalty
    rewardRate: 0.01,                 // 1% daily
    stakeLockupPeriod: 604_800,       // 7 days
    
    // Governance Parameters
    minProposalStake: 5_000_000,      // 5 GREMLINAI
    votingPeriod: 604_800,            // 7 days
    quorum: 10,                       // 10%
    quorumPercentage: 10,             // 10%
    executionDelay: 86_400,           // 24 hours
    emergencyQuorum: 20,              // 20%
    proposalThreshold: 5_000_000,     // 5 GREMLINAI
    votingThreshold: 60,              // 60%
    proposalExecutionThreshold: 60,    // 60%
    proposalCooldownPeriod: 86_400,   // 24 hours
    
    // Security Features
    treasuryGuards: true,
    delegateValidation: true,
    timelockDuration: 86_400,         // 24 hours
    maxConcurrentProposals: 10,
    
    // Voting Configuration
    voteWeights: {
        yes: 1,
        no: 1,
        abstain: 0
    }
};

export interface StakeInfo {
    id: string;
    stakeId: string;
    amount: number;
    duration: number;
    startTime: number;
    lockupEndTime: number;
    lockupEnds: number;
    estimatedReward: number;
    status: 'ACTIVE' | 'UNSTAKING' | 'COMPLETED';
}

export interface UnstakeResult {
    success: boolean;
    amount: number;
    reward: number;
    penalty?: number;
    timestamp: number;
}

export interface ChaosRequestParams {
    targetProgram: string;
    chaosType?: string;
    testType: TestType;
    duration: number;
    intensity?: number;
    securityLevel?: number;
    executionEnvironment?: 'sgx' | 'kvm' | 'wasm';
    maxDuration?: number;
    stakingAmount?: number;
}

export interface ChaosRequest {
    id: string;
    requestId: string;
    params: ChaosRequestParams;
    status: 'pending' | 'running' | 'completed' | 'failed';
    createdAt: number;
    updatedAt: number;
    result?: TestResult;
}

export interface TestResult {
    requestId: string;
    status: 'success' | 'failure';
    findings: Finding[];
    metrics: TestMetrics;
    completedAt: number;
    error?: string;
}

export interface ChaosResult {
    success: boolean;
    requestId: string;
    findings: Finding[];
    metrics: TestMetrics;
    timestamp: number;
    error?: string;
}

export interface Finding {
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    evidence?: {
        transaction?: string;
        logs?: string[];
        stackTrace?: string;
    };
}

export interface TestMetrics {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    averageBlockTime: number;
    cpuUtilization: number;
    memoryUsage: number;
    testDuration: number;
}

export interface ProposalParams {
    title: string;
    description: string;
    stakingAmount: number;
    testParams: ChaosRequestParams;
}

export interface VulnerabilityResult {
    prediction: number[];
    confidence: number;
    type: VulnerabilityType;
}

export interface VulnerabilityDetectionModel {
    ensureInitialized(): Promise<void>;
    predict(features: number[][]): Promise<PredictionResult>;
    cleanup(): Promise<void>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
}

export interface RedisQueueWorker {
    initialize(): Promise<void>;
    close(): Promise<void>;
    isInitialized(): boolean;
    enqueueRequest(request: ChaosRequest): Promise<void>;
    getRequest(requestId: string): Promise<ChaosRequest | null>;
    updateRequest(request: ChaosRequest): Promise<void>;
    getTestResult(requestId: string): Promise<TestResult | null>;
}

export interface ProposalData {
    title: string;
    description: string;
    proposer: PublicKey;
    startTime: number;
    endTime: number;
    executionTime: number;
    voteWeights: {
        yes: number;
        no: number;
        abstain: number;
    };
    votes: PublicKey[];
    quorum: number;
    executed: boolean;
    state: ProposalState;
}

export interface VoteRecord {
    proposal: PublicKey;
    voter: PublicKey;
    vote: 'yes' | 'no' | 'abstain';
    weight: number;
    timestamp: number;
}

export interface DelegationRecord {
    delegator: PublicKey;
    delegate: PublicKey;
    amount: number;
    timestamp: number;
    expiry?: number;
}

export interface VoteWeight {
    total: number;
    baseStake: number;
    hasSpoogeBonus: boolean;
    delegatedPower: number;
}

export interface GovernanceManager {
    connection: Connection;
    wallet: any; // Replace with proper wallet type
    config: Required<GovernanceConfig>;
    validateProposal(connection: Connection, proposalAddress: PublicKey): Promise<ProposalData>;
    createProposalInstruction(params: {
        proposer: PublicKey;
        title: string;
        description: string;
        stakingAmount: number;
        testParams: ChaosRequestParams;
    }): Promise<TransactionInstruction>;
    createProposal(title: string, description: string, stakingAmount: number): Promise<{ proposalId: string; signature: string; }>;
    vote(proposalId: string, vote: 'yes' | 'no' | 'abstain'): Promise<string>;
    execute(proposalId: string): Promise<string>;
    cancel(proposalId: string): Promise<string>;
    getVoteRecord(voteRecordAddress: PublicKey): Promise<VoteRecord>;
    getVoteRecords(proposalId: string): Promise<VoteRecord[]>;
    getProposals(): Promise<ProposalData[]>;
    getVotingPower(voter: PublicKey): Promise<number>;
    getDelegation(delegator: PublicKey, delegate: PublicKey): Promise<DelegationRecord | null>;
    getDelegatedBalance(delegator: PublicKey): Promise<number>;
    calculateVoteWeight(voter: PublicKey, proposalId: string): Promise<VoteWeight>;
    getProposalState(proposalId: string): Promise<ProposalState>;
    getProposalData(proposalId: string): Promise<ProposalData>;
}

export interface BaseErrorDetails {
    code: ErrorCode;
    message: string;
    metadata: ErrorMetadata;
}

export interface ErrorDetails extends BaseErrorDetails {
    timestamp: number;
    stackTrace: string;
    source: {
        file: string;
        line: number;
        function: string;
    };
}

export interface ErrorMetadata {
    programId: string;
    instruction: string;
    error: string;
    accounts: string[];
    value: string | number | boolean | null;
    payload: string | number | boolean | null;
    mutation: {
        type: string;
        target: string;
        payload: string | number | boolean | null;
    };
    vulnerability?: {
        type: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        location?: string;
        evidence?: string[];
        impact?: string;
        mitigation?: string;
        cwe?: string;
        cvss?: {
            score: number;
            vector: string;
        };
    };
    securityContext: {
        environment: 'mainnet' | 'testnet';
        computeUnits?: number;
        memoryUsage?: number;
        slot?: number;
        blockTime?: number;
        authority?: string;
        signers?: string[];
        programAuthority?: string;
        upgradeable: boolean;
        validations: {
            ownerChecked: boolean;
            signerChecked: boolean;
            accountDataMatched: boolean;
            pdaVerified: boolean;
            bumpsMatched: boolean;
        };
    };
}

export interface ErrorObject {
    message: string;
    code?: string | number;
    name?: string;
    stack?: string;
}

export type ErrorLike = Error | ErrorObject | { message: string } | string;

export interface MutationError {
    type: MutationType;
    target: string;
    payload?: string | number | boolean | null;
    message: string;
    code: ErrorCode;
}

export interface ValidationResult {
    vulnerable: boolean;
    error?: string;
    details?: {
        type: VulnerabilityType;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        evidence?: string[];
        impact?: string;
        likelihood?: string;
        exploitability?: string;
        remediation?: string;
        validations?: {
            ownerChecked: boolean;
            signerChecked: boolean;
            accountDataMatched: boolean;
            pdaVerified: boolean;
            bumpsMatched: boolean;
        };
    };
}

export interface TestResult {
    success: boolean;
    error?: string;
    vulnerabilities?: VulnerabilityInfo[];
}

export interface ProposalStatus {
    id: string;
    proposer: string;
    title: string;
    description: string;
    status: ProposalState;
    votes: {
        yes: number;
        no: number;
        abstain: number;
    };
    startTime: number;
    endTime: number;
    executionTime?: number;
    stakedAmount: number;
    testParams?: ChaosRequestParams;
}

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

export interface DataPoint {
    features: number[];
    label: number;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface DataBatch {
    inputs: Tensor;
    labels: Tensor;
    metadata?: {
        batchSize: number;
        timestamp: number;
        metrics?: Record<string, number>;
    };
}

export interface ModelCheckpoint {
    epoch: number;
    timestamp: number;
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

export enum VulnerabilitySeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

export interface VulnerabilityLocation {
    file?: string;
    line?: number;
    function?: string;
}

export interface VulnerabilityAnalysis {
    type: VulnerabilityType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confidence: number; // 0-1 scale
    description: string;
    location?: {
        file: string;
        startLine: number;
        endLine: number;
        function?: string;
    };
    details: {
        impact: string;
        likelihood: string;
        exploitScenario?: string;
        recommendation: string;
        references?: string[];
    };
    metadata?: {
        testId: string;
        timestamp: number;
        detectionMethod: string;
        relatedFindings?: string[];
    };
    proof?: {
        transactionId?: string;
        logOutput?: string;
        reproductionSteps?: string[];
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

export interface SecurityMetrics {
    codeQuality: number;
    vulnerabilities: number;
    accessControl: number;
    pdaValidation: number;
    cpiSafety: number;
    timestamp: number;
    findings: Array<{
        type: VulnerabilityType;
        severity: 'low' | 'medium' | 'high' | 'critical';
        location?: string;
        description: string;
    }>;
}

export interface VulnerabilityReport {
    type: VulnerabilityType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    location?: string;
    description: string;
    evidence?: {
        transaction?: string;
        logs?: string[];
        stackTrace?: string;
    };
    metadata?: Record<string, unknown>;
}

export interface SecurityContext {
    securityLevel: number;
    maxRetries: number;
    timeoutMs: number;
    rateLimit: number;
    sandboxed: boolean;
    resourceLimits: {
        maxMemoryMb: number;
        maxCpuTimeMs: number;
        maxNetworkCalls: number;
        maxInstructions: number;
    };
}

export interface ChaosTestResult {
    success: boolean;
    vulnerabilities: Array<{
        type: VulnerabilityType;
        severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
        confidence: number;
        description: string;
        evidence: string[];
        recommendation: string;
        metadata?: Record<string, unknown>;
    }>;
    metrics: {
        executionTime: number;
        memoryUsage: number;
        cpuUtilization: number;
        networkCalls: number;
        instructionsExecuted: number;
        coverage: number;
    };
    securityProof: {
        hash: string;
        signature: string;
        timestamp: number;
        validator: string;
    };
}

export interface GovernanceTestConfig extends FuzzingConfig {
    proposalSpamProtection: boolean;
    treasuryGuards: boolean;
    quorumRequirements: number;
    timelockDuration: number;
    delegateValidation: boolean;
    emergencyShutoff: boolean;
}

export interface SecurityReport {
    timestamp: number;
    programId: string;
    riskScore: number;
    findings: Array<{
        type: VulnerabilityType;
        severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
        confidence: number;
        description: string;
        location: string;
        impact: string;
        likelihood: string;
        recommendation: string;
        evidence: string[];
    }>;
    metrics: {
        coverage: number;
        vulnerabilityDensity: number;
        meanTimeToDetection: number;
        falsePositiveRate: number;
        exploitComplexity: number;
        attackSurfaceScore: number;
    };
}

export { ErrorCode } from './errors.js';

