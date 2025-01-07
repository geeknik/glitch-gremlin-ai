import { GlitchSDK, TestType, GlitchError } from '../index';
import { Keypair } from '@solana/web3.js';

describe('Rate Limiting', () => {
    jest.setTimeout(15000); // Increase timeout for all rate limiting tests
    
    let sdk: GlitchSDK;
    
    beforeEach(() => {
        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });
        
        // Reset timer mocks before each test
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('request rate limiting', () => {
        let mockIncr: jest.SpyInstance;
        let mockExpire: jest.SpyInstance;

        beforeEach(() => {
            mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockImplementation(() => Promise.resolve(1));
            mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockImplementation(() => Promise.resolve(1));
        });

        afterEach(() => {
            mockIncr.mockRestore();
            mockExpire.mockRestore();
        });

        it('should enforce cooldown between requests', async () => {
            const mockGet = jest.spyOn(sdk['queueWorker']['redis'], 'get')
                .mockImplementation(() => Promise.resolve(null));
            const mockSet = jest.spyOn(sdk['queueWorker']['redis'], 'set')
                .mockImplementation(() => Promise.resolve('OK'));
            mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockImplementation(() => Promise.resolve(1));
            mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockImplementation(() => Promise.resolve(1));

            // Make first request
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            // Mock get to simulate recent request
            mockGet.mockImplementation(() => Promise.resolve(Date.now().toString()));

            // First request should succeed
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            // Immediate second request should fail due to cooldown
            mockGet.mockImplementation(() => Promise.resolve(Date.now().toString()));
            
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            })).rejects.toThrow('Rate limit exceeded');

            // After cooldown period, request should succeed
            jest.advanceTimersByTime(2000);
            mockGet.mockImplementation(() => Promise.resolve((Date.now() - 2500).toString()));

            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            expect(mockIncr).toHaveBeenCalledTimes(2);
            expect(mockExpire).toHaveBeenCalledTimes(2);
        });

        it('should enforce maximum requests per minute', async () => {
            const mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockImplementation(() => Promise.resolve(1));
            const mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockImplementation(() => Promise.resolve(1));

            // First request should succeed
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            // Mock incr to simulate hitting limit
            mockIncr.mockImplementation(() => Promise.resolve(4));

            // Fourth request should fail
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
            }

            // Fourth request should fail
            await expect(async () => {
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
            }).rejects.toThrow('Rate limit exceeded');

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
