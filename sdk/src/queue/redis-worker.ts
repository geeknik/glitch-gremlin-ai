import IORedis from 'ioredis';
import { GlitchError } from '../errors.js';
import type { Redis as RedisType } from 'ioredis';
import type { ChaosRequestParams, ChaosResult } from '../types.js';

export class RedisQueueWorker {
    private redis: RedisType;
    private readonly queueKey = 'glitch:chaos:queue';
    private readonly resultKey = 'glitch:chaos:results';

    constructor(redisClient?: RedisType) {
        this.redis = redisClient || new IORedis({
            host: process.env.REDIS_HOST || 'r.glitchgremlin.ai',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            connectTimeout: 5000,
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number): number => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            enableOfflineQueue: true,
            lazyConnect: true
        }) as RedisType;

        this.redis.on('error', (err: Error): void => {
            console.error('Redis connection error:', err.message, err.stack);
        });
    }

    async enqueueRequest(params: ChaosRequestParams): Promise<string> {
        try {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.redis.lpush(this.queueKey, JSON.stringify({
                id: requestId,
                params,
                timestamp: Date.now()
            }));
            return requestId;
        } catch (err) {
            throw new GlitchError(`Failed to enqueue request: ${err instanceof Error ? err.message : 'Unknown error'}`, 2003);
        }
    }

    async dequeueRequest(): Promise<{id: string, params: ChaosRequestParams} | null> {
        try {
            const data = await this.redis.rpop(this.queueKey);
            if (!data) return null;
            return JSON.parse(data);
        } catch (err) {
            if (err instanceof SyntaxError) {
                throw new GlitchError('Invalid queue data', 2001);
            }
            throw err;
        }
    }

    async storeResult(requestId: string, result: ChaosResult): Promise<void> {
        await this.redis.hset(this.resultKey, requestId, JSON.stringify(result));
        // Set expiry to 24 hours
        await this.redis.expire(this.resultKey, 86400);
    }

    async getResult(requestId: string): Promise<ChaosResult | null> {
        try {
            const result = await this.redis.hget(this.resultKey, requestId);
            if (!result) return null;
            return JSON.parse(result);
        } catch (err) {
            if (err instanceof SyntaxError) {
                throw new GlitchError('Invalid result data', 2002);
            }
            throw err;
        }
    }

    async close(): Promise<void> {
        await this.redis.quit();
        await this.redis.disconnect();
    }
}
