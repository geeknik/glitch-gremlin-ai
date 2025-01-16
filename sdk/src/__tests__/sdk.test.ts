import { jest } from '@jest/globals';
import { GlitchSDK, TestType } from '../index.js';
import type { SDKConfig } from '../types.js';
import { Keypair, Connection, PublicKey, Commitment } from '@solana/web3.js';
import { Redis, RedisKey } from 'ioredis';
import { GlitchError, ErrorCode } from '../errors.js';
import type { MockRedisClient } from '../types.js';
import { SimulatedTransactionResponse } from '@solana/web3.js';
import type { MockedFunction, MockedObject } from 'jest-mock';

// Test-specific type definitions
// Test-specific type definitions
interface RedisStore {
[key: string]: {
    value: string | number | null;
    expiry?: number;
};
}

interface TestRedisClient extends Partial<Redis> {
queue?: string[];
connected: boolean;
store: RedisStore;
cleanup: () => Promise<void>;
incr: jest.Mock<Promise<number>, [RedisKey]>;
get: jest.Mock<Promise<string | null>, [RedisKey]>;
set: jest.Mock<Promise<'OK'>, [RedisKey, string]>;
expire: jest.Mock<Promise<number>, [RedisKey, number]>;
keys: jest.Mock<Promise<string[]>, [string]>;
flushall: jest.Mock<Promise<'OK'>, []>;
ping: jest.Mock<Promise<'PONG'>, []>;
disconnect: jest.Mock<Promise<void>, []>;
quit: jest.Mock<Promise<'OK'>, []>;
on: jest.Mock<Redis, any[]>;
hset: jest.Mock<Promise<string>, [string, string]>;
lpush: jest.Mock<Promise<number>, [string, string]>;
rpop: jest.Mock<Promise<string | null>, [string]>;
getRawClient: jest.Mock<TestRedisClient, []>;
}
jest.setTimeout(30000);

// Initialize mock Redis client at the top level
// Initialize mock Redis client and test state
let mockRedisClient: jest.Mocked<TestRedisClient>;
let redisQueueWorker: RedisQueueWorker;

// Track request state globally
const mockState = {
    requestCount: 0,
    lastRequestTime: 0
};
    /** SDK instance used across tests */
    let sdk: GlitchSDK;
    /** Mock Solana connection */
    let mockConnection: MockedObject<Connection>;

    /**
    * Set up test environment before each test
    */
    beforeEach(async () => {
        // Setup mock connection
        mockConnection = {
            getAccountInfo: jest.fn(),
            getBalance: jest.fn(),
            getVersion: jest.fn().mockReturnValue({ 
                'feature-set': 1234567, 
                'solana-core': '1.7.0' 
            }),
            sendTransaction: jest.fn(),
            simulateTransaction: jest.fn(),
            commitment: 'confirmed' as Commitment,
            rpcEndpoint: 'https://api.devnet.solana.com'
        } as unknown as MockedObject<Connection>;

        // Create fresh mock Redis client for each test
        // Create fresh mock Redis client for each test with proper state management
        mockRedisClient = {
            queue: [],
            connected: true,
            store: {},

            // Core Redis operations
            incr: jest.fn().mockImplementation(async (key: RedisKey) => {
                const now = Date.now();
                const entry = mockRedisClient.store[key];
                
                // Check expiry
                if (entry?.expiry && now > entry.expiry) {
                    delete mockRedisClient.store[key];
                    return 1;
                }

                const current = entry?.value || '0';
                const nextVal = parseInt(current.toString()) + 1;
                mockRedisClient.store[key] = { value: nextVal };
                mockState.requestCount = nextVal;
                mockState.lastRequestTime = now;
                return nextVal;
            }),

            get: jest.fn().mockImplementation(async (key: RedisKey) => {
                const entry = mockRedisClient.store[key];
                if (!entry) return null;
                if (entry.expiry && Date.now() > entry.expiry) {
                    delete mockRedisClient.store[key];
                    return null;
                }
                return entry.value.toString();
            }),

            set: jest.fn().mockImplementation(async (key: RedisKey, value: string) => {
                mockRedisClient.store[key] = { value };
                return 'OK';
            }),

            expire: jest.fn().mockImplementation(async (key: RedisKey, seconds: number) => {
                const entry = mockRedisClient.store[key];
                if (!entry) return 0;
                entry.expiry = Date.now() + (seconds * 1000);
                return 1;
            }),

            // Test utilities
            keys: jest.fn().mockImplementation(async (pattern: string) => {
                return Object.keys(mockRedisClient.store).filter(key => 
                    key.includes(pattern.replace('*', ''))
                );
            }),

            flushall: jest.fn().mockImplementation(async () => {
                mockRedisClient.store = {};
                mockRedisClient.queue = [];
                mockState.requestCount = 0;
                mockState.lastRequestTime = 0;
                return 'OK';
            }),

            ping: jest.fn().mockResolvedValue('PONG'),
            disconnect: jest.fn().mockResolvedValue(undefined),
            quit: jest.fn().mockResolvedValue('OK'),
            on: jest.fn().mockReturnThis()
        } as unknown as MockedObject<TestRedisClient>;

        // Set up additional Redis mock methods
        mockRedisClient.hset = jest.fn().mockImplementation(async (key: string, field: string) => {
            if (field === 'bad-result') {
                throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
            }
            return JSON.stringify({test: 'data'});
        });
        
        mockRedisClient.lpush = jest.fn().mockImplementation(async (key: string, value: string) => {
            if (value === 'invalid-json') {
                throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
            }
            return 1;
        });
        
        mockRedisClient.rpop = jest.fn().mockImplementation(async function(this: TestRedisClient, key: string) {
            if (key === 'empty-queue') {
                return null;
            }
            return this.queue?.shift() ?? null;
        });
        
        mockRedisClient.getRawClient = jest.fn().mockReturnValue(mockRedisClient);

        // Create RedisQueueWorker with mock client
        redisQueueWorker = new RedisQueueWorker(mockRedisClient);
        redisQueueWorker.getRawClient = jest.fn().mockResolvedValue(mockRedisClient);
        jest.spyOn(Connection.prototype, 'getVersion').mockResolvedValue({ 'solana-core': '1.7.0' });

        // Mock the GlitchSDK constructor
        jest.spyOn(GlitchSDK.prototype as any, 'initialize').mockImplementation(async function(this: GlitchSDK) {
            // @ts-ignore: Access private property for testing
            this.queueWorker = redisQueueWorker;
            return undefined;
        });

        const createSpy = jest.spyOn(GlitchSDK, 'create');
        sdk = await GlitchSDK.create({
            cluster: "https://api.devnet.solana.com",
            wallet: Keypair.generate(),
            redisConfig: {
                host: "localhost",
                port: 6379
            },
            heliusApiKey: 'mock-api-key'
        } as SDKConfig);
    });
    /**
    * Clean up test environment after each test
    */
    afterEach(async () => {
        try {
            // Reset mock state and cleanup
            mockState.requestCount = 0;
            mockState.lastRequestTime = 0;
            
            // Clean up Redis mock
            if (mockRedisClient?.flushall) {
                await mockRedisClient.flushall();
            }
            
            // Reset SDK worker
            if (sdk?.['queueWorker']) {
                await sdk['queueWorker'].close();
            }
            
            // Cleanup timers and mocks
            jest.clearAllMocks();
            jest.useRealTimers();
            jest.restoreAllMocks();
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
    });

    afterAll(async () => {
        try {
            if (sdk?.['queueWorker']) {
                const worker = sdk['queueWorker'] as RedisQueueWorker;
                if (typeof worker.close === 'function') {
                    await worker.close();
                }
            }

            if (mockRedisClient?.disconnect) {
                await mockRedisClient.disconnect();
            }
            
            // Cleanup any pending timers/mocks
            await new Promise(resolve => setTimeout(resolve, 100));
            jest.useRealTimers();
            jest.restoreAllMocks();
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    });

    /**
    * Unit Tests
    */
    describe('Unit Tests', () => {
        describe('createChaosRequest', () => {
            /**
            * Test basic chaos request creation
            */
        it('should create a valid chaos request', async () => {
            const request = await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            });

            expect(request.requestId).toBeDefined();
            expect(typeof request.waitForCompletion).toBe('function');
        });

        it('should validate intensity range', async () => {
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 11 // Invalid intensity
            })).rejects.toThrow('Intensity must be between 1 and 10');
        });

        it('should validate duration range', async () => {
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 30, // Too short
                intensity: 5
            })).rejects.toThrow('Duration must be between 60 and 3600 seconds');
        });
    });

    /**
    * Integration Tests
    */
    describe('version compatibility', () => {
        it('should export correct version', async () => {
            const { version } = await import('../index.js');
            expect(version).toBe('0.1.0');
        });
    });

    describe('governance', () => {
        jest.setTimeout(60000); // Increase timeout for long-running test
        
        it('should create a valid proposal', async () => {
            // Mock the connection's simulateTransaction to avoid actual network calls
            // Mock balance check
            const mockGetBalance = jest.spyOn(sdk['connection'] as any, 'getBalance')
                .mockResolvedValue(200_000_000); // 0.2 SOL

            const mockSimulateTransaction = jest.spyOn(sdk['connection'] as any, 'simulateTransaction')
                .mockResolvedValue({
                    context: { slot: 0 },
                    value: { 
                        err: null,
                        logs: [],
                        accounts: null,
                        unitsConsumed: 0,
                        returnData: null
                    }
                });

            // Mock sendTransaction to return a fake signature
            const mockSendTransaction = jest.spyOn(sdk['connection'], 'sendTransaction')
                .mockResolvedValue('mock-signature');

            const proposal = await sdk.createProposal({
                title: "Test Proposal",
                description: "Test Description",
                testParams: {
                    testType: TestType.FUZZ,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                },
                stakingAmount: 100_000_000 // 0.1 SOL
            });

            expect(proposal.id).toBeDefined();
            expect(proposal.signature).toBeDefined();

            // Clean up mocks
            mockSimulateTransaction.mockRestore();
            mockSendTransaction.mockRestore();
            mockGetBalance.mockRestore();
        });

        it('should validate minimum stake amount', async () => {
            await expect(sdk.createProposal({
                title: "Test Proposal",
                description: "Test Description",
                testParams: {
                    testType: TestType.FUZZ,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                },
                stakingAmount: 10 // Too low
            })).rejects.toThrow('Insufficient stake amount');
        });
    });

    /**
    * Economic Model Tests 
    */
    describe('token economics', () => {
        /**
        * Test fee calculation logic
        */
        it('should calculate correct fees', async () => {
            const fee = await sdk.calculateChaosRequestFee({
                testType: TestType.FUZZ,
                duration: 300,
                intensity: 5
            });
            expect(typeof fee).toBe('number');
            expect(fee).toBeGreaterThan(0);
        });
    });

    /**
    * Rate Limiting Tests
    */
    describe('rate limiting', () => {
        /**
        * Set up rate limiting test environment
        */
        beforeEach(async () => {
                // Reset timer and state before each test
                jest.useFakeTimers();
                await mockRedisClient.flushall();
                mockState.requestCount = 0;
                mockState.lastRequestTime = 0;
            });

            afterEach(() => {
                jest.useRealTimers();
            });

            it('should enforce rate limits for single requests', async () => {
                jest.setTimeout(10000); // Increase timeout for this test
                
                // Track request count
                let callCount = 0;
        
                // Mock incr to enforce rate limit
                mockRedisClient.incr.mockImplementation(async () => {
                    callCount++;
                    if (callCount > 1) {
                        throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
                    }
                    return callCount;
                });

                // First request should succeed
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                expect(mockState.requestCount).toBe(1);

                // Immediate second request should fail
                await expect(sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                })).rejects.toThrow('Rate limit exceeded');
                expect(mockState.requestCount).toBe(1);
            });

            it('should enforce rate limits for parallel requests', async () => {
                const requests = Array.from({ length: 5 }, () => ({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                }));
                
                const promises = requests.map(params => sdk.createChaosRequest(params));
                await expect(Promise.all(promises)).rejects.toThrow('Rate limit exceeded');
                expect(mockState.requestCount).toBeLessThanOrEqual(1);
            });

            it('should allow requests after cooldown period', async () => {
                // First request
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                expect(mockState.requestCount).toBe(1);
                const firstRequestTime = mockState.lastRequestTime;

                // Wait for cooldown
                jest.advanceTimersByTime(2000);

                // Second request should succeed
                const result = await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                expect(result.requestId).toBeDefined();
                });
            });
        });
    });
    });
    });
