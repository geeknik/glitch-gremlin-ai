import Redis from 'ioredis';
export class RedisQueueWorker {
    redis;
    queueKey = 'glitch:chaos:queue';
    resultKey = 'glitch:chaos:results';
    constructor(redisClient) {
        this.redis = redisClient || new Redis({
            host: 'r.glitchgremlin.ai',
            port: 6379,
            connectTimeout: 5000,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            enableOfflineQueue: true,
            lazyConnect: true
        });
        this.redis.on('error', (err) => {
            console.error('Redis connection error:', err);
        });
    }
    async enqueueRequest(params) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await this.redis.lpush(this.queueKey, JSON.stringify({
            id: requestId,
            params,
            timestamp: Date.now()
        }));
        return requestId;
    }
    async dequeueRequest() {
        const data = await this.redis.rpop(this.queueKey);
        if (!data)
            return null;
        return JSON.parse(data);
    }
    async storeResult(requestId, result) {
        await this.redis.hset(this.resultKey, requestId, JSON.stringify(result));
        // Set expiry to 24 hours
        await this.redis.expire(this.resultKey, 86400);
    }
    async getResult(requestId) {
        const result = await this.redis.hget(this.resultKey, requestId);
        return result ? JSON.parse(result) : null;
    }
    async close() {
        await this.redis.quit();
        await this.redis.disconnect();
    }
}
