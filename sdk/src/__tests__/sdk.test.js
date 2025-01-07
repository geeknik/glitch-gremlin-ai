import { GlitchSDK, TestType } from '../index';
import { Keypair } from '@solana/web3.js';
describe('GlitchSDK', () => {
    let sdk;
    beforeEach(async () => {
        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });
    });
    afterEach(async () => {
        if (sdk) {
            await sdk['queueWorker'].close();
            await sdk['connection'].getRecentBlockhash(); // Ensure all pending requests complete
            // Connection doesn't need explicit cleanup
        }
        // Clear any pending timers and intervals
        jest.clearAllTimers();
        jest.clearAllMocks();
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
            const { version } = await import('../index');
            expect(version).toBe('0.1.0');
        });
    });
    describe('governance', () => {
        it('should create a valid proposal', async () => {
            // Mock the connection's simulateTransaction to avoid actual network calls
            // Mock balance check
            const mockGetBalance = jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValue(5000);
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
                stakingAmount: 1000
            });
            expect(proposal.id).toBeDefined();
            expect(proposal.signature).toBeDefined();
            // Clean up mocks
            mockSimulateTransaction.mockRestore();
            mockSendTransaction.mockRestore();
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
            beforeEach(() => {
                jest.useFakeTimers();
            });
            afterEach(() => {
                jest.useRealTimers();
            });
            it('should enforce rate limits for single requests', async () => {
                jest.setTimeout(10000); // Increase timeout for this test
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
