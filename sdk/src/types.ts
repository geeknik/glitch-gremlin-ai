import { RedisKey, Redis } from 'ioredis';
import { PublicKey, Keypair } from '@solana/web3.js';

export enum TestType {
    FUZZ = "FUZZ",
    LOAD = "LOAD", 
    EXPLOIT = "EXPLOIT",
    CONCURRENCY = "CONCURRENCY"
}

export enum VulnerabilityType {
    Reentrancy = "reentrancy",
    ArithmeticOverflow = "arithmetic-overflow",
    AccessControl = "access-control",
    RaceCondition = "race-condition",
    InstructionInjection = "instruction-injection",
    AccountConfusion = "account-confusion", 
    SignerAuthorization = "signer-authorization",
    PdaValidation = "pda-validation",
    ClockManipulation = "clock-manipulation",
    LamportDrain = "lamport-drain"
}

export enum ProposalState {
    Draft = "draft",
    Active = "active", 
    Succeeded = "succeeded",
    Defeated = "defeated",
    Executed = "executed",
    Cancelled = "cancelled",
    Queued = "queued",
    Expired = "expired"
}

export interface SDKConfig {
    cluster: string;
    wallet: Keypair;
    programId?: string;
    governanceConfig?: GovernanceConfig;
    redisConfig?: RedisConfig;
    heliusApiKey: string | undefined;
}

export interface RedisConfig {
    host: string;
    port: number;
    maxRetriesPerRequest?: number;
    connectTimeout?: number;
    retryStrategy?: (times: number) => number | null;
}

export type RedisClient = Redis | MockRedisClient;

export interface MockRedisClient {
    queue?: string[];
    connected?: boolean;
    incr: (key: RedisKey) => Promise<number>;
    expire: (key: RedisKey, seconds: number) => Promise<number>;
    get: (key: RedisKey) => Promise<string | null>;
    set: (key: RedisKey, value: string) => Promise<'OK'>;
    on: (event: string, callback: Function) => MockRedisClient;
    quit?: () => Promise<'OK'>;
    disconnect?: () => Promise<void>;
    flushall: () => Promise<'OK'>;
    hset: (key: RedisKey, field: string, value: string) => Promise<number>;
    hget: (key: RedisKey, field: string) => Promise<string | null>;
    lpush: (key: RedisKey, value: string) => Promise<number>;
    rpop: (key: RedisKey) => Promise<string | null>;
}



export interface GovernanceConfig {
    minVotingPeriod: number;
    maxVotingPeriod: number;
    minStakeAmount: number;
    votingPeriod: number;
    quorum: number;
    executionDelay: number;
}

export interface ChaosRequestParams {
    targetProgram: string;
    testType: TestType;
    duration: number;
    intensity: number;
}

export interface ChaosResult {
    requestId: string;
    status: string;
    resultRef: string;
    logs: string[];
    metrics: {
        totalTransactions: number;
        errorRate: number;
        avgLatency: number;
    };
}

export interface PredictionResult {
    type: VulnerabilityType;
    confidence: number;
    timestamp?: number;
    modelVersion?: string;
    prediction: number[];
    details?: string;
    location?: string;
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
    predict(features: number[]): Promise<PredictionResult>;
    ensureInitialized(): Promise<void>;
    cleanup(): Promise<void>;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
}

