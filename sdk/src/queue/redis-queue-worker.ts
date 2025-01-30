import { Redis } from 'ioredis';
import type { ChaosRequest, TestResult } from '../types.js';

export class RedisQueueWorker {
    private redis: Redis;
    private initialized: boolean = false;
    private readonly requestsQueue = 'chaos-requests';
    private readonly resultsPrefix = 'test-results:';

    constructor(redis: Redis) {
        this.redis = redis;
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Test Redis connection
            await this.redis.ping();
            this.initialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize Redis queue worker: ${error}`);
        }
    }

    public async close(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        try {
            await this.redis.quit();
            this.initialized = false;
        } catch (error) {
            throw new Error(`Failed to close Redis connection: ${error}`);
        }
    }

    public async enqueueRequest(request: ChaosRequest): Promise<void> {
        if (!this.initialized) {
            throw new Error('Redis queue worker not initialized');
        }

        try {
            // Store request data
            const requestKey = `request:${request.requestId}`;
            await this.redis.hset(requestKey, {
                ...request,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            // Add to processing queue
            await this.redis.lpush(this.requestsQueue, request.requestId);
        } catch (error) {
            throw new Error(`Failed to enqueue request: ${error}`);
        }
    }

    public async getTestResult(requestId: string): Promise<TestResult | null> {
        if (!this.initialized) {
            throw new Error('Redis queue worker not initialized');
        }

        try {
            const resultKey = `${this.resultsPrefix}${requestId}`;
            const result = await this.redis.get(resultKey);
            
            if (!result) {
                return null;
            }

            return JSON.parse(result) as TestResult;
        } catch (error) {
            throw new Error(`Failed to get test result: ${error}`);
        }
    }

    public async getRawClient(): Promise<Redis> {
        return this.redis;
    }
}
