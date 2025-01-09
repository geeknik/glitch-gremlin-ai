import { jest } from '@jest/globals';
import { GlitchSDK, TestType } from '../index.js'; 
import { Keypair } from '@solana/web3.js';

// Increase timeout for all tests
jest.setTimeout(30000);

describe('GlitchSDK', () => {
    let sdk: GlitchSDK;
    
    beforeEach(async () => {
        const wallet = Keypair.generate();
        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });

        // Enhanced Redis mock with rate limiting
        let requestCount = 0;
        sdk['queueWorker']['redis'] = {
            incr: jest.fn().mockImplementation(async () => {
                requestCount++;
                if (requestCount > 1) {
                    throw new GlitchError('Rate limit exceeded');
                }
                return requestCount;
            }),
            expire: jest.fn().mockResolvedValue(1),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            on: jest.fn(),
            quit: jest.fn().mockResolvedValue('OK'),
            disconnect: jest.fn().mockResolvedValue('OK'),
            flushall: jest.fn().mockResolvedValue('OK'),
            hset: jest.fn().mockImplementation(async (key, field, value) => {
                if (typeof value !== 'string') {
                    throw new SyntaxError('Invalid JSON');
                }
                return 1;
            }),
            hget: jest.fn().mockImplementation(async (key, field) => {
                if (field === 'bad-result') {
                    throw new SyntaxError('Invalid JSON');
                }
                return JSON.stringify({test: 'data'});
            }),
            lpush: jest.fn().mockImplementation(async (key, value) => {
                if (value === 'invalid-json') {
                    throw new SyntaxError('Invalid JSON');
                }
                return 1;
            }),
            rpop: jest.fn().mockImplementation(async function(key) {
                if (key === 'empty-queue') {
                    return null;
                }
                // Return the actual queued data
                const queue = this.queue || [];
                return queue.length > 0 ? queue.shift() : null;
            }),
            lpush: jest.fn().mockImplementation(async function(key, value) {
                if (!this.queue) {
                    this.queue = [];
                }
                this.queue.push(value);
                return 1;
            })
        } as unknown as Redis;

        // Mock Solana connection methods
        jest.spyOn(sdk['connection'], 'getBalance').mockResolvedValue(1_000_000_000);
        jest.spyOn(sdk['connection'], 'sendTransaction').mockResolvedValue('mock-tx-signature');
        jest.spyOn(sdk['connection'], 'simulateTransaction').mockResolvedValue({
            context: { slot: 0 },
            value: { 
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        });
    });

    afterEach(async () => {
        if (sdk) {
            await sdk['queueWorker'].close();
            // Connection cleanup not needed
            jest.clearAllTimers();
            jest.clearAllMocks();
        }
    });

    afterAll(async () => {
        jest.useRealTimers();
        jest.restoreAllMocks();
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
            const mockGetBalance = jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValue(200_000_000); // 0.2 SOL

            const mockSimulateTransaction = jest.spyOn(sdk['connection'], 'simulateTransaction')
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
                
                // Mock incr to track request count and enforce limit
                let requestCount = 0;
                const originalIncr = sdk['queueWorker']['redis'].incr;
                // Track request times
                const requestTimes: number[] = [];
                
                let requestCount = 0;
                sdk['queueWorker']['redis'].incr.mockImplementation(async function() {
                    requestCount++;
                    if (requestCount > 1) {
                        throw new GlitchError('Rate limit exceeded');
                    }
                    return requestCount;
                });

                // First request should succeed
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });

                // Immediate second request should fail
                await expect(sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                })).rejects.toThrow('Rate limit exceeded');

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

                let requestCount = 0;
                sdk['queueWorker']['redis'].incr.mockImplementation(async function() {
                    requestCount++;
                    if (requestCount > 1) {
                        throw new GlitchError('Rate limit exceeded');
                    }
                    return requestCount;
                });

                await expect(Promise.all(promises))
                    .rejects.toThrow('Rate limit exceeded');
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
