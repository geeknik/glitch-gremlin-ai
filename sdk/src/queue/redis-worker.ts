import Redis from 'ioredis';
import { ChaosRequestParams, ChaosResult } from '../types';

export class RedisQueueWorker {
    private redis: Redis;
    private readonly queueKey = 'glitch:chaos:queue';
    private readonly resultKey = 'glitch:chaos:results';

    constructor() {
        this.redis = new Redis({
            host: 'r.glitchgremlin.ai',
            port: 6379,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
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
    }
}
