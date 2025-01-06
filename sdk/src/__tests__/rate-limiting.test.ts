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
            })).rejects.toThrow(GlitchError);

            // After cooldown period, request should succeed
            jest.advanceTimersByTime(2000);

            await sdk.createChaosRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            });
        });

        it('should enforce maximum requests per minute', async () => {
            // Mock Redis to simulate rate limit exceeded
            const mockIncr = jest.spyOn(sdk['queueWorker']['redis'], 'incr')
                .mockResolvedValue(5); // Over the limit of 3
            const mockExpire = jest.spyOn(sdk['queueWorker']['redis'], 'expire')
                .mockResolvedValue(1);

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
        // Increase timeout for governance tests
        jest.setTimeout(30000);
        
        it('should limit proposals per day', async () => {
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

            // Second proposal same day should fail
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
