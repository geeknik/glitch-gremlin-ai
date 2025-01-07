import { GlitchSDK, TestType, GlitchError } from '../index';
import { Keypair } from '@solana/web3.js';

describe('Rate Limiting', () => {
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
            let requestCount = 0;
            const mockGet = jest.spyOn(sdk['queueWorker']['redis'], 'get')
                .mockImplementation(() => Promise.resolve(null));
            const mockSet = jest.spyOn(sdk['queueWorker']['redis'], 'set')
                .mockImplementation(() => Promise.resolve('OK'));
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
            let requestCount = 0;
            const mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockImplementation(() => Promise.resolve(++requestCount));
            const mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockImplementation(() => Promise.resolve(1));

            // First 3 requests should succeed
            for (let i = 0; i < 3; i++) {
                await sdk.createChaosRequest({
                    targetProgram: "11111111111111111111111111111111",
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 1
                });
            }

            // Fourth request should fail
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            })).rejects.toThrow('Rate limit exceeded');

            expect(mockIncr).toHaveBeenCalledTimes(4);
            expect(mockExpire).toHaveBeenCalledTimes(3);
        });
    });

    describe('governance rate limiting', () => {
        beforeAll(() => {
            jest.setTimeout(60000); // Increase timeout to 60s for all governance tests
        });

        it('should limit proposals per day', async () => {
            jest.setTimeout(10000); // Increase timeout to 10s
            let proposalCount = 0;
            const mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockImplementation(() => Promise.resolve(++proposalCount));
            const mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockImplementation(() => Promise.resolve(1));

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
            await expect(sdk.createProposal({
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
            })).rejects.toThrow('Rate limit exceeded');

            expect(mockIncr).toHaveBeenCalledTimes(2);
            expect(mockExpire).toHaveBeenCalledTimes(1);

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
            expect(mockExpire).toHaveBeenCalledTimes(2);
        });
    });
});
