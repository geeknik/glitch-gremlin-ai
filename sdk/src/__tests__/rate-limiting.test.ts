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
        mockIncr = jest.fn(() => Promise.resolve(1));
        mockExpire = jest.fn(() => Promise.resolve(1));
        
        sdk['queueWorker']['redis'] = {
            incr: mockIncr,
            expire: mockExpire,
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK')
        } as unknown as Redis;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        mockIncr.mockRestore();
        mockExpire.mockRestore();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('rate limiting', () => {
        describe('request limits', () => {
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

            // Second request should succeed
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            // Third request should fail due to cooldown
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
            expect(mockGet).toHaveBeenCalled();
            expect(mockSet).toHaveBeenCalled();

            mockGet.mockRestore();
            mockSet.mockRestore();
        });

        it('should enforce maximum requests per minute', async () => {
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
                jest.setTimeout(30000); // Increase timeout for this test
                
                let proposalCount = 0;
                mockIncr.mockImplementation(async () => ++proposalCount);

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

                expect(mockIncr).toHaveBeenCalledTimes(2);
                expect(mockExpire).toHaveBeenCalledTimes(2);

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
});
import { jest } from '@jest/globals';
import { GlitchSDK, TestType } from '../index.js';
import { Keypair } from '@solana/web3.js';
import { GlitchError } from '../errors.js';
import type { Redis } from 'ioredis';

// Initialize SDK before all tests
let sdk: GlitchSDK;

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
        mockIncr = jest.fn(() => Promise.resolve(1));
        mockExpire = jest.fn(() => Promise.resolve(1));
        
        sdk['queueWorker']['redis'] = {
            incr: mockIncr,
            expire: mockExpire,
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK')
        } as unknown as Redis;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        mockIncr.mockRestore();
        mockExpire.mockRestore();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('rate limiting', () => {
        describe('request limits', () => {
            it('should enforce cooldown between requests', async () => {
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

            it('should enforce maximum requests per minute', async () => {
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
            });
        });
    });
});
