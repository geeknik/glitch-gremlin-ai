import { jest } from '@jest/globals';
import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import type { Redis } from 'ioredis';

// Define proper types for Redis mock
interface RedisMock {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<'OK'>;
    del(key: string): Promise<number>;
    exists(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    quit(): Promise<'OK'>;
    disconnect(): Promise<void>;
    connect(): Promise<void>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string, callback?: () => void): void;
}

// Create Redis mock with proper types
export const mockRedis = {
    incr: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK' as const),
    del: jest.fn(async () => 1),
    exists: jest.fn(async () => 0),
    keys: jest.fn(async () => [] as string[]),
    quit: jest.fn(async () => 'OK' as const),
    disconnect: jest.fn(async () => undefined),
    connect: jest.fn(async () => undefined),
    publish: jest.fn(async () => 0),
    subscribe: jest.fn((channel: string, callback?: () => void) => {
        if (callback) callback();
    })
} as RedisMock;

// Define proper types for Solana account data
interface MockAccountData {
    version: string;
    state: string;
    owner: string;
    balance: number;
}

// Define proper types for Solana Connection mock
interface ConnectionMock {
    commitment: Commitment;
    rpcEndpoint: string;
    getAccountInfo(publicKey: PublicKey): Promise<{
        data: Buffer;
        executable: boolean;
        lamports: number;
        owner: PublicKey;
        rentEpoch: number;
    }>;
    sendTransaction(transaction: any, signers?: any[]): Promise<string>;
    simulateTransaction(transaction: any): Promise<{
        context: { slot: number };
        value: {
            err: null;
            logs: string[];
            accounts: null;
            unitsConsumed: number;
            returnData: null;
        };
    }>;
    confirmTransaction(signature: string): Promise<{
        value: { err: null };
    }>;
    getBalance(publicKey: PublicKey): Promise<number>;
    getVersion(): Promise<{ 'solana-core': string }>;
    getRecentBlockhash(): Promise<{
        blockhash: string;
        feeCalculator: {
            lamportsPerSignature: number;
        };
    }>;
}

// Create mock account data
const mockAccountData: MockAccountData = {
    version: '0.0.1',
    state: 'initialized',
    owner: '11111111111111111111111111111111',
    balance: 1000000000
};

// Create Solana Connection mock with proper types
export const mockConnection = {
    commitment: 'confirmed' as Commitment,
    rpcEndpoint: 'http://localhost:8899',
    getAccountInfo: jest.fn(async () => ({
        data: Buffer.from(JSON.stringify(mockAccountData)),
        executable: false,
        lamports: 1000000000,
        owner: new PublicKey('11111111111111111111111111111111'),
        rentEpoch: 0
    })),
    sendTransaction: jest.fn(async () => 'mock-signature'),
    simulateTransaction: jest.fn(async () => ({
        context: { slot: 0 },
        value: {
            err: null,
            logs: [],
            accounts: null,
            unitsConsumed: 0,
            returnData: null
        }
    })),
    confirmTransaction: jest.fn(async () => ({
        value: { err: null }
    })),
    getBalance: jest.fn(async () => 1000000000),
    getVersion: jest.fn(async () => ({ 'solana-core': '1.18.26' })),
    getRecentBlockhash: jest.fn(async () => ({
        blockhash: 'test-blockhash',
        feeCalculator: {
            lamportsPerSignature: 5000
        }
    }))
} as ConnectionMock;

// Setup global mocks
declare global {
    var mockRedis: RedisMock;
    var mockConnection: ConnectionMock;
}

global.mockRedis = mockRedis;
global.mockConnection = mockConnection;

// Mock environment variables
process.env.SOLANA_CLUSTER = 'devnet';
process.env.PROGRAM_ID = '11111111111111111111111111111111';
process.env.HELIUS_API_KEY = 'test-api-key';

// Cleanup function
afterAll(async () => {
    await mockRedis.quit();
    await mockRedis.disconnect();
    jest.clearAllMocks();
});
