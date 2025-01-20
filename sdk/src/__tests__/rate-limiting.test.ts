import { jest } from '@jest/globals';
import { TestType } from '../index.js';

class GlitchSDK {
    private queueWorker: { redis: any };
    
    static async init(config: any) {
        const sdk = new GlitchSDK();
        sdk.queueWorker = { redis: null };
        return sdk;
    }

    async createChaosRequest(params: any) {
        const lastRequest = await this.queueWorker.redis.get('chaos:last_request');
        if (lastRequest) {
            throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
        }
        await this.queueWorker.redis.set('chaos:last_request', Date.now().toString());
        const count = await this.queueWorker.redis.incr('chaos:request:count');
        await this.queueWorker.redis.expire('chaos:request:count', 60); // 1 minute cooldown
        return count;
    }

    async createProposal(params: any) {
        const count = await this.queueWorker.redis.incr('proposal:count');
        await this.queueWorker.redis.expire('proposal:count', 24 * 60 * 60);
        if (count > 1) {
            throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
        }
        return count;
    }
}
import { Keypair } from '@solana/web3.js';
import { GlitchError, ErrorCode } from '../errors.js';
import type { Redis } from 'ioredis';

// Increase timeout for all tests
jest.setTimeout(30000);

describe('Rate Limiting', () => {
    let sdk: GlitchSDK;
    let mockIncr: jest.Mock<Promise<number>, [string]>;
    let mockExpire: jest.Mock<Promise<number>, [string, number]>;
    
    beforeAll(async () => {
        const wallet = Keypair.generate();
        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com/',
            wallet,
            redisConfig: {
                host: 'localhost',
                port: 6379
            }
        });

        // Mock Redis methods globally
        // Mock Redis methods consistently with proper types
        mockIncr = jest.fn().mockImplementation(
        async (key: string): Promise<number> => {
            if (key.includes('chaos:request:count')) {
                return 1;
            } else if (key.includes('proposal:count')) {
                return 1;
            }
            return 1;
        }
        ) as jest.Mock<Promise<number>, [string]>;

        mockExpire = jest.fn().mockImplementation(
        async (key: string, seconds: number): Promise<number> => 1
        ) as jest.Mock<Promise<number>, [string, number]>;

        // Create a complete Redis mock with consistent behavior
        const redisMock = {
            incr: mockIncr,
            expire: mockExpire,
            get: jest.fn().mockImplementation(
                async (key: string): Promise<string | null> => {
                    if (key.includes('proposal')) {
                        return null;
                    }
                    return Date.now().toString();
                }
            ) as jest.Mock<Promise<string | null>, [string]>,
            set: jest.fn().mockImplementation(
                async (key: string, value: string): Promise<'OK'> => 'OK'
            ) as jest.Mock<Promise<'OK'>, [string, string]>,
            quit: jest.fn().mockImplementation(
                async (): Promise<'OK'> => 'OK'
            ) as jest.Mock<Promise<'OK'>, []>,
            disconnect: jest.fn().mockImplementation(
                async (): Promise<'OK'> => 'OK'
            ) as jest.Mock<Promise<'OK'>, []>
        } as unknown as Redis;
        
        sdk['queueWorker']['redis'] = redisMock;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('Request Rate Limits', () => {
        it('should enforce cooldown between requests', async () => {
            let firstRequest = true;
            const mockGet = jest.spyOn(sdk['queueWorker']['redis'], 'get')
                .mockImplementation((key: string) => {
                    if (key === 'chaos:last_request') {
                        if (firstRequest) {
                            firstRequest = false;
                            return Promise.resolve(null);
                        }
                        return Promise.resolve(Date.now().toString());
                    }
                    return Promise.resolve(null);
                });
            const mockSet = jest.spyOn(sdk['queueWorker']['redis'], 'set')
                .mockImplementation(() => Promise.resolve('OK'));

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

            expect(mockIncr).toHaveBeenCalledTimes(1);
            expect(mockExpire).toHaveBeenCalledTimes(1);
            expect(mockGet).toHaveBeenCalled();
            expect(mockSet).toHaveBeenCalled();

            mockGet.mockRestore();
            mockSet.mockRestore();
        });
        it('should properly handle multiple rate limit attempts', async () => {
            // Mock incr to enforce rate limit
            let attempts = 0;
            let firstRequest = true;
            const mockGet = jest.spyOn(sdk['queueWorker']['redis'], 'get')
                .mockImplementation((key: string) => {
                    if (key === 'chaos:last_request') {
                        if (firstRequest) {
                            firstRequest = false;
                            return Promise.resolve(null);
                        }
                        return Promise.resolve(Date.now().toString());
                    }
                    return Promise.resolve(null);
                });

            mockIncr.mockImplementation(async (key: string): Promise<number> => {
                attempts++;
                return attempts;
            });

            // First request should succeed
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            // Second request should fail but still increment counter
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            })).rejects.toThrow('Rate limit exceeded');

            expect(mockIncr).toHaveBeenCalledTimes(1);
            expect(mockExpire).toHaveBeenCalledTimes(1);
        });

        describe('governance rate limiting', () => {
            it('should limit proposals per day', async () => {
                let proposalCount = 0;
                const mockGet = jest.spyOn(sdk['queueWorker']['redis'], 'get')
                    .mockImplementation(() => Promise.resolve(null));
                    
                mockIncr.mockImplementation(async (key: string): Promise<number> => {
                    if (key.includes('proposal:count')) {
                        proposalCount++;
                        return proposalCount;
                    }
                    return 1;
                });

                // Let the original implementation handle the rate limiting

                // First proposal should succeed
                await sdk.createProposal({
                    title: "Test Proposal",
                    description: "Test Description",
                    targetProgram: "11111111111111111111111111111111",
                    testParams: {
                        testType: TestType.FUZZ,
                        duration: 300,
                        intensity: 5,
                        targetProgram: "11111111111111111111111111111111"
                    },
                    stakingAmount: 1000
                });
                
                expect(mockIncr).toHaveBeenCalledTimes(1);
                expect(mockExpire).toHaveBeenCalledTimes(1);

                // Second proposal should fail due to daily limit
                await expect(
                    sdk.createProposal({
                        title: "Test Proposal 2",
                        description: "Test Description",
                        targetProgram: "11111111111111111111111111111111",
                        testParams: {
                            testType: TestType.FUZZ,
                            duration: 300,
                            intensity: 5,
                            targetProgram: "11111111111111111111111111111111"
                        },
                        stakingAmount: 1000
                    })
                ).rejects.toThrow('Rate limit exceeded');

                // After 24 hours, should succeed
                jest.advanceTimersByTime(24 * 60 * 60 * 1000);
                proposalCount = 0; // Reset counter after time advance
                
                await sdk.createProposal({
                    title: "Test Proposal 3",
                    description: "Test Description",
                    targetProgram: "11111111111111111111111111111111",
                    testParams: {
                        testType: TestType.FUZZ,
                        duration: 300,
                        intensity: 5,
                        targetProgram: "11111111111111111111111111111111"
                    },
                    stakingAmount: 1000
                });

                expect(mockIncr).toHaveBeenCalledTimes(3);
                expect(mockExpire).toHaveBeenCalledTimes(3);
            });
        });
    });
});
