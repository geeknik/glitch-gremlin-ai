import { Redis } from 'ioredis';
import { GlitchAIEngine } from './ai/engine';
import { Logger } from './utils/logger';
import { ZkVMExecutor } from './zkvm/executor';

export class QueueListener {
    private redis: Redis;
    private aiEngine: GlitchAIEngine;
    private logger: Logger;
    private isRunning: boolean = false;

    private zkVMExecutor?: ZkVMExecutor;

    constructor(redisUrl: string = 'redis://r.glitchgremlin.ai:6379', useZkVM: boolean = false) {
        this.redis = new Redis(redisUrl);
        this.aiEngine = new GlitchAIEngine();
        this.logger = new Logger();
        
        if (useZkVM) {
            this.zkVMExecutor = new ZkVMExecutor();
            this.logger.info('zkVM execution enabled');
        }
    }

    async start() {
        this.isRunning = true;
        this.logger.info('Queue listener started');

        while (this.isRunning) {
            try {
                // Block for 5 seconds waiting for new test requests
                const result = await this.redis.brpop('test:requests', 5);
                
                if (result) {
                    const [_, data] = result;
                    const request = JSON.parse(data);
                    
                    this.logger.info(`Processing test request ${request.id}`);
                    
                    let testResult;
                    if (this.zkVMExecutor) {
                        // Execute in zkVM for enhanced privacy
                        const zkResult = await this.zkVMExecutor.executeTest(
                            request.programId,
                            {
                                type: request.testType,
                                params: request.params
                            }
                        );
                        testResult = {
                            ...zkResult.results,
                            proof: zkResult.proof
                        };
                    } else {
                        // Standard execution
                        testResult = await this.aiEngine.executeChaosTest(
                            request.programId,
                            request.testType,
                            request.params
                        );
                    }

                    // Store result
                    await this.redis.hset('test:results', request.id, JSON.stringify(testResult));
                    
                    this.logger.info(`Completed test request ${request.id}`);
                }
            } catch (error) {
                this.logger.error('Error processing test request:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async stop() {
        this.isRunning = false;
        await this.redis.quit();
    }
}
