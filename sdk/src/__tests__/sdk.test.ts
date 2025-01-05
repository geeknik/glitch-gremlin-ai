import { GlitchSDK, TestType } from '../index';
import { Keypair } from '@solana/web3.js';

describe('GlitchSDK', () => {
    let sdk: GlitchSDK;
    
    beforeEach(() => {
        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });
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
        it('should export correct version', () => {
            expect(require('../index').version).toBe('0.1.0');
        });
    });
});
