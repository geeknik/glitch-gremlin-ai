import IORedis from 'ioredis';
import { GlitchError } from '../errors.js';
import type { Redis as RedisType } from 'ioredis';
import type { ChaosRequestParams, ChaosResult } from '../types.js';

interface RequestLimit {
    maxRequests: number;
    window: number;
}

interface RequestLimits {
    [key: string]: RequestLimit;
}
export class RedisQueueWorker {
    protected redis: RedisType;
    private readonly queueKey = 'glitch:chaos:queue';
    private readonly resultKey = 'glitch:chaos:results';
    private readonly rateLimitKey = 'glitch:chaos:ratelimit';
    private readonly limitTrackerKey = 'glitch:chaos:limittracker';
    private readonly requestCountKey = 'glitch:chaos:requestcount';
    
    private readonly requestLimits: RequestLimits = {
        DEFAULT: { maxRequests: 100, window: 3600 },
        FUZZING: { maxRequests: 50, window: 1800 },
        SECURITY: { maxRequests: 30, window: 1800 }
    };

    /**
    * Get the raw Redis client for testing purposes only
    * @internal
    */
    public getRawClient(): RedisType {
        if (!this.redis) {
            throw new GlitchError('Redis client not initialized', 2007);
        }
        return this.redis;
    }

    constructor(redisClient?: RedisType) {
        this.redis = redisClient || new IORedis({
            host: process.env.REDIS_HOST || 'r.glitchgremlin.ai', 
            port: parseInt(process.env.REDIS_PORT || '6379'),
            connectTimeout: 5000,
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number): number | null => {
                if (times > 5) return null; // Stop retrying after 5 attempts
                return Math.min(times * 100, 3000); // Exponential backoff up to 3s
            },
            enableOfflineQueue: true,
            lazyConnect: true,
            reconnectOnError: (err: Error) => {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true; // Reconnect for READONLY error
                }
                return false;
            }
        }) as RedisType;

        if (!this.redis) {
            throw new GlitchError('Failed to initialize Redis client', 2007);
        }

        this.redis.on('error', (err: Error): void => {
            console.error('Redis connection error:', err.message, err.stack);
        });

        this.redis.on('ready', (): void => {
            console.info('Redis connection established');
        });

        this.redis.on('reconnecting', (): void => {
            console.warn('Redis reconnecting...');
        });
    }

    private async checkRateLimit(requestType: string): Promise<boolean> {
        const limit = this.requestLimits[requestType] || this.requestLimits.DEFAULT;
        const key = `${this.rateLimitKey}:${requestType}`;
        
        try {
            const current = await this.redis.incr(key);
            if (current === 1) {
                await this.redis.expire(key, limit.window);
            }
            return current <= limit.maxRequests;
        } catch (err) {
            console.error('Rate limit check failed:', err);
            return false;
        }
    }

    private async trackRequest(requestType: string): Promise<void> {
        const trackerKey = `${this.limitTrackerKey}:${requestType}`;
        const countKey = `${this.requestCountKey}:${requestType}`;
        
        try {
            await this.redis.multi()
                .hincrby(trackerKey, 'total', 1)
                .hincrby(trackerKey, 'active', 1)
                .incr(countKey)
                .expire(trackerKey, 86400)
                .expire(countKey, 86400)
                .exec();
        } catch (err) {
            console.error('Request tracking failed:', err);
        }
    }

    private validateRequest(params: ChaosRequestParams): void {
        if (!params.targetProgram) {
            throw new GlitchError('Target program is required', 2004);
        }
        if (params.intensity && (params.intensity < 1 || params.intensity > 10)) {
            throw new GlitchError('Intensity must be between 1 and 10', 2005);
        }
    }

    async enqueueRequest(params: ChaosRequestParams): Promise<string> {
        this.validateRequest(params);
        
        const requestType = params.testType || 'DEFAULT';
        if (!(await this.checkRateLimit(requestType))) {
            throw new GlitchError('Rate limit exceeded', 2006);
        }
        
        try {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const request = {
                id: requestId,
                params,
                timestamp: Date.now(),
                type: requestType
            };

            await this.redis.multi()
                .lpush(this.queueKey, JSON.stringify(request))
                .expire(this.queueKey, 86400)
                .exec();

            await this.trackRequest(requestType);
            return requestId;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            throw new GlitchError(`Failed to enqueue request: ${msg}`, 2003);
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
        try {
            // Cleanup rate limit keys
            const pattern = `${this.rateLimitKey}:*`;
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }

            // Close connection
            await this.redis.quit();
            await this.redis.disconnect();
        } catch (err) {
            console.error('Error during cleanup:', err);
            // Force disconnect if cleanup fails
            await this.redis.disconnect();
        }
    }

    // Utility method to get current request stats
    async getRequestStats(requestType: string): Promise<{ total: number; active: number; current: number }> {
        const trackerKey = `${this.limitTrackerKey}:${requestType}`;
        const countKey = `${this.requestCountKey}:${requestType}`;
        
        try {
            const [tracker, current] = await Promise.all([
                this.redis.hgetall(trackerKey),
                this.redis.get(countKey)
            ]);
            
            return {
                total: parseInt(tracker.total || '0'),
                active: parseInt(tracker.active || '0'),
                current: parseInt(current || '0')
            };
        } catch (err) {
            console.error('Failed to get request stats:', err);
            return { total: 0, active: 0, current: 0 };
        }
    }
}
