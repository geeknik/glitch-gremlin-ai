import { GlitchSDK } from '../../sdk/src';
import { security } from '../../jest.setup';

describe('Security Tests', () => {
  it('should run basic security scan', async () => {
    const sdk = await GlitchSDK.init({
    cluster: 'https://api.devnet.solana.com',
      wallet: {} as any,
      redisConfig: {
        host: 'r.glitchgremlin.ai',
        port: 6379
      }
    });

    const request = await sdk.createChaosRequest({
      targetProgram: "TestProgram111111111111111111111111111111111",
      testType: "EXPLOIT",
      duration: 60,
      intensity: 5
    });

    const results = await request.waitForCompletion();
    
    expect(results).toBeDefined();
    expect(security.scanner.scan).toHaveBeenCalled();
  });
});
