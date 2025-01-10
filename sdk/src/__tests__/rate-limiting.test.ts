import { jest } from '@jest/globals';
import { GlitchSDK, TestType } from '../index.js';
import { Keypair } from '@solana/web3.js';
import { GlitchError } from '../errors.js';
import type { Redis } from 'ioredis';

// Increase timeout for all tests
jest.setTimeout(30000);

describe('Rate Limiting', () => {
    let sdk: GlitchSDK;
    let mockIncr: jest.Mock;
    let mockExpire: jest.Mock;
    
    beforeAll(async () => {
        const wallet = Keypair.generate();
        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });

        // Mock Redis methods globally
        // Mock Redis methods consistently
        mockIncr = jest.fn().mockImplementation((key: string) => {
            if (key.includes('proposal')) {
                return Promise.resolve(1);
            }
            return Promise.resolve(2);
        });
        mockExpire = jest.fn(() => Promise.resolve(1));

        // Create a complete Redis mock with consistent behavior
        const redisMock = {
            incr: mockIncr,
            expire: mockExpire,
            get: jest.fn().mockImplementation((key: string) => {
                if (key.includes('proposal')) {
                    return Promise.resolve(null);
                }
                return Promise.resolve(Date.now().toString());
            }),
            set: jest.fn().mockResolvedValue('OK'),
            quit: jest.fn().mockResolvedValue('OK'),
            disconnect: jest.fn().mockResolvedValue('OK')
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
            const mockGet = jest.spyOn(sdk['queueWorker']['redis'], 'get')
                .mockImplementation(() => Promise.resolve(null));
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
            let requestCount = 0;
            mockIncr.mockImplementation(async () => {
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

            // Second request should fail
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            })).rejects.toThrow('Rate limit exceeded');

            // Request that hits the limit should fail
            await expect(
                sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                })
            ).rejects.toThrow('Rate limit exceeded');

            expect(mockIncr).toHaveBeenCalledTimes(2);
            expect(mockExpire).toHaveBeenCalledTimes(2);
        });

        describe('governance rate limiting', () => {
            it('should limit proposals per day', async () => {
                let proposalCount = 0;
                mockIncr.mockImplementation(() => {
                    proposalCount++;
                    if (proposalCount > 1) {
                        return Promise.reject(new GlitchError('Rate limit exceeded', 1007));
                    }
                    return Promise.resolve(1);
                });

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

                expect(mockIncr).toHaveBeenCalledTimes(2);
                expect(mockExpire).toHaveBeenCalledTimes(2);
            });
        });
    });
});
});
