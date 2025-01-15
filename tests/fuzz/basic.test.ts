import { GlitchSDK } from '@glitch-gremlin/sdk';
import { security } from '../../jest.setup';

describe('Fuzz Tests', () => {
  it('should run basic fuzz test', async () => {
    const sdk = new GlitchSDK({
    cluster: 'https://api.devnet.solana.com',
      wallet: {} as any
    });

    const request = await sdk.createChaosRequest({
      targetProgram: "TestProgram111111111111111111111111111111111",
      testType: "FUZZ",
      duration: 60,
      intensity: 5
    });

    const results = await request.waitForCompletion();
    
    expect(results).toBeDefined();
    expect(global.security.fuzz.test).toHaveBeenCalled();
  });
});
