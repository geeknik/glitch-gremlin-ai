import { GlitchSDK, TestType } from '../index';
import { Keypair } from '@solana/web3.js';
import { jest } from '@jest/globals';

describe('Rate Limiting', () => {
    let sdk: GlitchSDK;
    let mockIncr: jest.Mock;
    let mockExpire: jest.Mock;
    
    beforeEach(() => {
        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });

        // Initialize mock functions with proper types
        mockIncr = jest.fn().mockResolvedValue(1);
        mockExpire = jest.fn().mockResolvedValue(1);

        // Initialize mock functions with proper types
        mockIncr = jest.fn().mockResolvedValue(1);
        mockExpire = jest.fn().mockResolvedValue(1);
        
        // Assign mocks to redis methods
        // Type assertion needed since we're mocking internal Redis client
        sdk['queueWorker']['redis'].incr = mockIncr as any;
        sdk['queueWorker']['redis'].expire = mockExpire as any;
        
        jest.useFakeTimers();
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
            // Mock incr to simulate hitting limit
            mockIncr.mockImplementation(async () => 4);

            // First request should succeed
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

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
    });

    describe('governance rate limiting', () => {
        it('should limit proposals per day', async () => {
            let proposalCount = 0;
            mockIncr.mockImplementation(() => Promise.resolve(++proposalCount));

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
