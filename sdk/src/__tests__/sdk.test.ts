import { jest } from '@jest/globals';
import { GlitchSDK } from '../sdk.js';
import { TestType } from '../types.js';
import type { SDKConfig } from '../types.js';
import { Keypair, Connection, PublicKey, Commitment } from '@solana/web3.js';
import { Redis, RedisKey } from 'ioredis';
import { GlitchError, ErrorCode } from '../errors.js';
import type { MockRedisClient } from '../types.js';
import { RedisQueueWorker } from '../queue/redis-queue-worker.js';
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
incr: jest.Mock<any>;
get: jest.Mock<any>;
set: jest.Mock<any>;
expire: jest.Mock<any>;
keys: jest.Mock<any>;
flushall: jest.Mock<any>;
ping: jest.Mock<any>;
disconnect: jest.Mock<any>;
quit: jest.Mock<any>;
on: jest.Mock<any>;
hset: jest.Mock<any>;
lpush: jest.Mock<any>;
rpop: jest.Mock<any>;
getRawClient: jest.Mock<any>;
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
            incr: jest.fn<any>().mockImplementation(async (key: RedisKey) => {
                const now = Date.now();
                const entry = mockRedisClient.store[key as string];
                
                // Initialize mock state if needed
                if (!(global as any).mockState) {
                    (global as any).mockState = {
                        requestCount: 0,
                        lastRequestTime: 0
                    };
                }
                
                // Check expiry
                if (entry?.expiry && now > entry.expiry) {
                    delete mockRedisClient.store[key as string];
                    mockRedisClient.store[key as string] = { value: 1 };
                    (global as any).mockState.requestCount = 1;
                    (global as any).mockState.lastRequestTime = now;
                    return 1;
                }

                const current = entry?.value || '0';
                const nextVal = parseInt(current.toString()) + 1;
                mockRedisClient.store[key as string] = { value: nextVal };
                
                // Always increment mock state
                (global as any).mockState.requestCount += 1;
                (global as any).mockState.lastRequestTime = now;
                
                return nextVal;
            }),

            get: jest.fn<any>().mockImplementation(async (key: RedisKey) => {
                const entry = mockRedisClient.store[key as string];
                if (!entry) return null;
                if (entry.expiry && Date.now() > entry.expiry) {
                    delete mockRedisClient.store[key as string];
                    return null;
                }
                return entry.value.toString();
            }),

            set: jest.fn<any>().mockImplementation(async (key: RedisKey, value: string) => {
                mockRedisClient.store[key as string] = { value };
                return 'OK';
            }),

            expire: jest.fn<any>().mockImplementation(async (key: RedisKey, seconds: number) => {
                const entry = mockRedisClient.store[key as string];
                if (!entry) return 0;
                entry.expiry = Date.now() + (seconds * 1000);
                return 1;
            }),

            // Test utilities
            keys: jest.fn<any>().mockImplementation(async (pattern: string) => {
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

            ping: jest.fn<any>().mockResolvedValue('PONG'),
            disconnect: jest.fn<any>().mockResolvedValue(undefined),
            quit: jest.fn<any>().mockResolvedValue('OK'),
            on: jest.fn().mockReturnThis()
        } as unknown as MockedObject<TestRedisClient>;

        // Set up additional Redis mock methods
        mockRedisClient.hset = jest.fn<any>().mockImplementation(async (key: string, field: string) => {
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
        
        mockRedisClient.rpop = jest.fn<any>().mockImplementation(async function(this: TestRedisClient, key: string) {
            if (key === 'empty-queue') {
                return null;
            }
            return this.queue?.shift() ?? null;
        });
        
        mockRedisClient.getRawClient = jest.fn<() => Redis>().mockReturnValue(mockRedisClient as unknown as Redis);

        // Create RedisQueueWorker with mock client
        redisQueueWorker = new RedisQueueWorker(mockRedisClient as unknown as Redis);
        redisQueueWorker.getRawClient = jest.fn().mockResolvedValue(mockRedisClient as unknown as Redis);
        jest.spyOn(Connection.prototype, 'getVersion').mockResolvedValue({ 'solana-core': '1.7.0' });

        // Create fresh RedisQueueWorker instance
        redisQueueWorker = new RedisQueueWorker(mockRedisClient as unknown as Redis);
        await redisQueueWorker.initialize();

        // Create SDK instance with mock connection
        sdk = new GlitchSDK({
            cluster: "https://api.devnet.solana.com",
            wallet: Keypair.generate(),
            redisConfig: {
                host: "localhost",
                port: 6379
            },
            heliusApiKey: 'mock-api-key',
            minStakeAmount: 100_000_000, // 0.1 SOL
            connection: mockConnection
        } as SDKConfig);

        // Set queue worker directly for testing
        Object.defineProperty(sdk, 'queueWorker', {
            value: redisQueueWorker,
            writable: true,
            configurable: true
        });
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
                const worker = sdk['queueWorker'] as unknown as RedisQueueWorker;
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
                stakingAmount: 10_000 // 0.00001 SOL (below minimum)
            })).rejects.toThrow('must be at least 0.1 SOL');
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
                
                // Reset mock state and Redis
                (global as any).mockState = {
                    requestCount: 0,
                    lastRequestTime: 0
                };
                await mockRedisClient.flushall();

                // First request should succeed
                const result = await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                expect(result.requestId).toBeDefined();
                expect((global as any).mockState.requestCount).toBe(1);

                // Immediate second request should fail
                await expect(sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                })).rejects.toThrow('Rate limit exceeded');
                expect((global as any).mockState.requestCount).toBe(1);
            });

            it('should enforce rate limits for parallel requests', async () => {
                const requests = Array.from({ length: 5 }, () => ({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                }));
                
                // Execute requests sequentially to properly test rate limiting
                try {
                    for (const params of requests) {
                        await sdk.createChaosRequest(params);
                    }
                    fail('Should have thrown rate limit error');
                } catch (error) {
                    expect(error).toBeInstanceOf(GlitchError);
                    expect((error as GlitchError).message).toContain('Rate limit exceeded');
                }
                expect(mockState.requestCount).toBeLessThanOrEqual(3);
            });

            it('should allow requests after cooldown period', async () => {
                // Initialize mock state and Redis
                (global as any).mockState = {
                    requestCount: 0,
                    lastRequestTime: 0
                };
                await mockRedisClient.flushall();

                // First request
                const firstResult = await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                expect(firstResult.requestId).toBeDefined();
                expect((global as any).mockState.requestCount).toBe(1);
                const firstRequestTime = (global as any).mockState.lastRequestTime;

                // Wait for cooldown
                jest.advanceTimersByTime(2000);

                // Second request should succeed
                const secondResult = await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                expect(secondResult.requestId).toBeDefined();
                expect((global as any).mockState.lastRequestTime).toBeGreaterThan(firstRequestTime);
                expect((global as any).mockState.requestCount).toBe(2);
            });
            });
        });
