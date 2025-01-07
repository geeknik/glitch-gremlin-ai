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
            // Mock lastRequestTime to simulate recent request
            sdk['lastRequestTime'] = Date.now();

            // First request should succeed
            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            // Immediate second request should fail due to cooldown
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            })).rejects.toThrow('Rate limit exceeded');

            // After cooldown period, request should succeed
            jest.advanceTimersByTime(2000);

            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });

            expect(mockIncr).toHaveBeenCalled();
            expect(mockExpire).toHaveBeenCalled();
        });

        it('should enforce maximum requests per minute', async () => {
            // Mock Redis to simulate rate limit exceeded
            mockIncr.mockImplementation(() => Promise.resolve(5)); // Over the limit of 3

            // Request should fail due to rate limit
            await expect(sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            })).rejects.toThrow('Rate limit exceeded');

            expect(mockIncr).toHaveBeenCalled();
            expect(mockExpire).toHaveBeenCalled();
        });
    });

    describe('governance rate limiting', () => {
        beforeAll(() => {
            jest.setTimeout(60000); // Increase timeout to 60s for all governance tests
        });

        it('should limit proposals per day', async () => {
            // Mock Redis rate limit check
            const mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockImplementation(() => Promise.resolve(5)); // Over daily limit
            const mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockImplementation(() => Promise.resolve(1));

            // Create first proposal
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

            // Second proposal should fail due to rate limit
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

            expect(mockIncr).toHaveBeenCalled();
            expect(mockExpire).toHaveBeenCalled();

            // After 24 hours, should succeed
            jest.advanceTimersByTime(24 * 60 * 60 * 1000);

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
        });
    });
});
