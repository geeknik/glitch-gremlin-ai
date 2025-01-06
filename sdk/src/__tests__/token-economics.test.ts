import { GlitchSDK, TestType } from '../index';
import { Keypair } from '@solana/web3.js';

describe('Token Economics', () => {
    let sdk: GlitchSDK;
    
    beforeEach(async () => {
        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });
    });

    describe('fee calculation', () => {
        it('should calculate base fees correctly', async () => {
            const params = {
                testType: TestType.FUZZ,
                duration: 300,
                intensity: 5
            };
            const fee = await sdk.calculateChaosRequestFee(params);
            expect(fee).toBeGreaterThan(0);
            expect(typeof fee).toBe('number');
        });

        it('should scale fees with duration', async () => {
            const shortTest = await sdk.calculateChaosRequestFee({
                testType: TestType.FUZZ,
                duration: 300,
                intensity: 5
            });

            const longTest = await sdk.calculateChaosRequestFee({
                testType: TestType.FUZZ,
                duration: 600,
                intensity: 5
            });

            expect(longTest).toBeGreaterThan(shortTest);
        });

        it('should scale fees with intensity', async () => {
            const lowIntensity = await sdk.calculateChaosRequestFee({
                testType: TestType.FUZZ,
                duration: 300,
                intensity: 2
            });

            const highIntensity = await sdk.calculateChaosRequestFee({
                testType: TestType.FUZZ,
                duration: 300,
                intensity: 8
            });

            expect(highIntensity).toBeGreaterThan(lowIntensity);
        });
    });

    describe('rate limiting', () => {
        it('should enforce request rate limits', async () => {
            const params = {
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            };

            // First request should succeed
            await sdk.createChaosRequest(params);

            // Second immediate request should fail
            await expect(sdk.createChaosRequest(params))
                .rejects.toThrow('Rate limit exceeded');
        });

        it('should allow requests after cooldown', async () => {
            const params = {
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 1
            };

            await sdk.createChaosRequest(params);
            
            // Wait for rate limit to reset
            await new Promise(resolve => setTimeout(resolve, 2100));

            // Should succeed after cooldown
            await expect(sdk.createChaosRequest(params))
                .resolves.toBeDefined();
        });
    });
});
