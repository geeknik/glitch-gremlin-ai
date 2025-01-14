import { GlitchSDK } from '@glitch-gremlin/sdk';
import { security } from '../../jest.setup';

describe('Mutation Tests', () => {
  it('should run basic mutation test', async () => {
    const sdk = new GlitchSDK({
      cluster: 'devnet',
      wallet: {} as any
    });

    const request = await sdk.createChaosRequest({
      targetProgram: "TestProgram111111111111111111111111111111111",
      testType: "MUTATION",
      duration: 60,
      intensity: 5
    });

    const results = await request.waitForCompletion();
    
    expect(results).toBeDefined();
    expect(security.mutation.test).toHaveBeenCalled();
  });
});
