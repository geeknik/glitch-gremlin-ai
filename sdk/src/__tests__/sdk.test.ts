import { jest } from '@jest/globals';
import { GlitchSDK, TestType } from '../index.js'; 
import { Keypair, Connection, PublicKey, Commitment } from '@solana/web3.js';
import { Redis } from 'ioredis';
import { GlitchError, ErrorCode } from '../errors.js';
import type { MockRedisClient } from '../types';
import { SimulatedTransactionResponse } from '@solana/web3.js';
import type { MockedObject } from 'jest-mock';

jest.setTimeout(30000);

let mockRequestCount = { value: 0 };

describe('GlitchSDK', () => {
    let sdk: GlitchSDK;
    let mockRedisClient: jest.Mocked<MockRedisClient>;
    let mockConnection: MockedObject<Connection>;
    beforeEach(async () => {
        // Setup mock connection
        mockConnection = {
            getAccountInfo: jest.fn(),
            getBalance: jest.fn(),
            getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.7.0' }),
            sendTransaction: jest.fn(),
            simulateTransaction: jest.fn(),
            disconnect: jest.fn().mockResolvedValue(undefined),
            commitment: 'confirmed' as Commitment,
            rpcEndpoint: 'http://localhost:8899'
        } as unknown as MockedObject<Connection>;

        mockRedisClient = {
            queue: [] as string[],
            connected: true,
            incr: jest.fn().mockImplementation(async (key: string): Promise<number> => {
                mockRequestCount.value++;
                if (mockRequestCount.value > 1) {
                    throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
                }
                return mockRequestCount.value;
            }),
        expire: jest.fn().mockImplementation(async (key: string, seconds: number): Promise<number> => 1),
        get: jest.fn().mockImplementation(async (key: string): Promise<string | null> => null),
        set: jest.fn().mockImplementation(async (key: string, value: string): Promise<'OK'> => 'OK'),
        on: jest.fn().mockImplementation((event: string, callback: Function) => mockRedisClient),
        quit: jest.fn().mockImplementation(async (): Promise<'OK'> => 'OK'),
        disconnect: jest.fn().mockImplementation(async (): Promise<void> => undefined),
        flushall: jest.fn().mockImplementation(async (): Promise<'OK'> => 'OK'),
        hset: jest.fn().mockImplementation(async (key: string, field: string, value: string): Promise<number> => 1),
        hget: jest.fn().mockImplementation(async (key: string, field: string): Promise<string | null> => {
            if (field === 'bad-result') {
                throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
            }
            return JSON.stringify({test: 'data'});
        }),
        lpush: jest.fn().mockImplementation(async (key: string, value: string): Promise<number> => {
            if (value === 'invalid-json') {
                throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
            }
            return 1;
        }),
        rpop: jest.fn().mockImplementation(async function(this: MockRedisClient, key: string): Promise<string | null> {
            if (key === 'empty-queue') {
                return null;
            }
            return this.queue?.length ? this.queue.shift() ?? null : null;
        })
    } as jest.Mocked<MockRedisClient>;

        jest.spyOn(Connection.prototype, 'getVersion').mockResolvedValue({ 'solana-core': '1.7.0' });
        
        const createSpy = jest.spyOn(GlitchSDK, 'create');
        sdk = await GlitchSDK.create({
            endpoint: "http://localhost:8899",
            keypair: Keypair.generate(),
            redisUrl: "redis://localhost:6379",
            redis: mockRedisClient,
        });
    });

    afterEach(async () => {
        try {
            if (sdk?.['queueWorker']?.close) {
                await sdk['queueWorker'].close();
            }
            if (sdk?.['connection']?.disconnect) {
                await sdk['connection'].disconnect();
            }
            mockRequestCount.value = 0;
            await mockRedisClient.flushall();
            jest.clearAllMocks();
            jest.clearAllTimers();
            jest.restoreAllMocks();
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
    });

    afterAll(async () => {
        try {
            if (sdk) {
                if (sdk['connection']?.disconnect) {
                    await sdk['connection'].disconnect();
                }
                if (sdk['queueWorker']?.close) {
                    await sdk['queueWorker'].close();
                }
            }
            
            // Make sure all mocks and timers are cleaned up
            await new Promise(resolve => setTimeout(resolve, 100));
            jest.useRealTimers();
            jest.restoreAllMocks();
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    });

    describe('createChaosRequest', () => {
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

    describe('version compatibility', () => {
        it('should export correct version', async () => {
            const { version } = await import('../index.js');
            expect(version).toBe('0.1.0');
        });
    });

    describe('governance', () => {
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
                targetProgram: "11111111111111111111111111111111",
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
                targetProgram: "11111111111111111111111111111111",
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

    describe('token economics', () => {
        it('should calculate correct fees', async () => {
            const fee = await sdk.calculateChaosRequestFee({
                testType: TestType.FUZZ,
                duration: 300,
                intensity: 5
            });
            expect(typeof fee).toBe('number');
            expect(fee).toBeGreaterThan(0);
        });

        describe('rate limiting', () => {
            beforeEach(async () => {
                jest.useFakeTimers();
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
                expect(mockRequestCount.value).toBe(1);

                // Immediate second request should fail
                await expect(sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                })).rejects.toThrow('Rate limit exceeded');
                expect(mockRequestCount.value).toBe(1);

                // After waiting, request should succeed
                jest.advanceTimersByTime(2000);
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
                });

            it('should enforce rate limits for parallel requests', async () => {
                jest.setTimeout(10000); // Increase timeout for this test
                const promises = Array(5).fill(0).map(() => sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                }));

                let localRequestCount = { value: 0 };
                let incrCount = 0;
                const mockIncr = jest.fn().mockImplementation(async (key: string): Promise<number> => {
                    incrCount++;
                    if (incrCount > 1) {
                        throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
                    }
                    return incrCount;
                });
                sdk['queueWorker']['redis'].incr = mockIncr;

                await expect(Promise.all(promises)).rejects.toThrow('Rate limit exceeded');
            });

            it('should allow requests after cooldown period', async () => {
                jest.setTimeout(10000); // Increase timeout for this test
                // First request
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });

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
