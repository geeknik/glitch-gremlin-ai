import { Redis } from 'ioredis';
import { GlitchSDK, TestType, ChaosResult } from '@glitch-gremlin/sdk';
import { Connection, Keypair } from '@solana/web3.js';

export class TestWorker {
    private redis: Redis;
    private sdk: GlitchSDK;
    private running: boolean = false;

    constructor(
        redisUrl: string = 'redis://r.glitchgremlin.ai:6379',
        solanaRpcUrl: string = 'https://api.devnet.solana.com'
    ) {
        this.redis = new Redis(redisUrl);
        
        // Worker uses its own wallet for test execution
        const workerWallet = Keypair.generate(); 
        this.sdk = new GlitchSDK({
            cluster: solanaRpcUrl,
            wallet: workerWallet
        });
    }

    async start() {
        this.running = true;
        console.log('Test worker started');

        while (this.running) {
            try {
                // Get next test from queue
                const testRequest = await this.redis.brpop('test:queue', 5);
                
                if (testRequest) {
                    const [_, data] = testRequest;
                    const request = JSON.parse(data);
                    
                    console.log(`Processing test request ${request.id}`);
                    
                    // Execute the test
                    const result = await this.executeTest(request);
                    
                    // Store result
                    await this.redis.hset('test:results', request.id, JSON.stringify(result));
                }
            } catch (error) {
                console.error('Error processing test:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async stop() {
        this.running = false;
        await this.redis.quit();
    }

    private async executeTest(request: any): Promise<ChaosResult> {
        // Execute test based on parameters
        const chaosRequest = await this.sdk.createChaosRequest({
            targetProgram: request.targetProgram,
            testType: request.testType as TestType,
            duration: request.duration,
            intensity: request.intensity
        });

        return await chaosRequest.waitForCompletion();
    }
}
