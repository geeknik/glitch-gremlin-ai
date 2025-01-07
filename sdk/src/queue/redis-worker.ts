import IORedis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import type { ChaosRequestParams, ChaosResult } from '../types.js';

export class RedisQueueWorker {
    private redis: RedisType; 
    private readonly queueKey = 'glitch:chaos:queue';
    private readonly resultKey = 'glitch:chaos:results';

    constructor(redisClient?: Redis) {
        this.redis = redisClient || new Redis({
            host: 'r.glitchgremlin.ai',
            port: 6379,
            connectTimeout: 5000,
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            enableOfflineQueue: true,
            lazyConnect: true
        });

        this.redis.on('error', (err: Error) => {
            console.error('Redis connection error:', err);
        });
    }

    async enqueueRequest(params: ChaosRequestParams): Promise<string> {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await this.redis.lpush(this.queueKey, JSON.stringify({
            id: requestId,
            params,
            timestamp: Date.now()
        }));
        return requestId;
    }

    async dequeueRequest(): Promise<{id: string, params: ChaosRequestParams} | null> {
        const data = await this.redis.rpop(this.queueKey);
        if (!data) return null;
        return JSON.parse(data);
    }

    async storeResult(requestId: string, result: ChaosResult): Promise<void> {
        await this.redis.hset(this.resultKey, requestId, JSON.stringify(result));
        // Set expiry to 24 hours
        await this.redis.expire(this.resultKey, 86400);
    }

    async getResult(requestId: string): Promise<ChaosResult | null> {
        const result = await this.redis.hget(this.resultKey, requestId);
        return result ? JSON.parse(result) : null;
    }

    async close(): Promise<void> {
        await this.redis.quit();
        await this.redis.disconnect();
    }
}
