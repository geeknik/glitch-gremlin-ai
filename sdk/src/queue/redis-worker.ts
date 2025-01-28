import IORedis from 'ioredis';
import { GlitchError } from '../errors.js';
import type { Redis as RedisType } from 'ioredis';
import type { ChaosRequestParams, ChaosResult, RedisConfig } from '../types.js';

interface RequestLimit {
    maxRequests: number;
    window: number;
}

interface RequestLimits {
    [key: string]: RequestLimit;
}

export class RedisQueueWorker implements RedisConfig {
    protected redis: RedisType;
    public host: string = 'r.glitchgremlin.ai';
    public port: number = 6379;
    public maxRetriesPerRequest?: number = 3;
    public connectTimeout?: number = 5000;
    public retryStrategy?: (times: number) => number | null = (times) => Math.min(times * 100, 3000);
    private readonly queueKey = 'glitch:chaos:queue';
    private readonly resultKey = 'glitch:chaos:results';
    private readonly rateLimitKey = 'glitch:chaos:ratelimit';
    private readonly limitTrackerKey = 'glitch:chaos:limittracker';
    private readonly requestCountKey = 'glitch:chaos:requestcount';
    private readonly resultTTL = 3600; // 1 hour TTL for results
    
    private readonly requestLimits: RequestLimits = {
        DEFAULT: { maxRequests: 50, window: 3600 }, // Reduced from 100 to 50
        FUZZ: { maxRequests: 30, window: 1800 }, // Reduced from 50 to 30
        SECURITY: { maxRequests: 20, window: 1800 }  // Reduced from 30 to 20
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

    constructor(redisClient?: RedisType, config?: RedisConfig) {
        this.redis = redisClient || new IORedis({
            host: config?.host || process.env.REDIS_HOST || this.host,
            port: config?.port || parseInt(process.env.REDIS_PORT || String(this.port)),
            connectTimeout: 5000,
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number): number | null => {
                if (times > 5) return null;
                return Math.min(times * 100, 3000);
            },
            enableOfflineQueue: true,
            lazyConnect: true,
            reconnectOnError: (err: Error) => {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
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
        
        const multi = this.redis.multi();
        multi.incr(key);
        multi.expire(key, limit.window);
        
        try {
            const results = await multi.exec();
            if (!results) return false;
            
            const [incrErr, count] = results[0];
            if (incrErr) throw incrErr;
            
            return (count as number) <= limit.maxRequests;
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
        const multi = this.redis.multi();
        multi.hset(this.resultKey, requestId, JSON.stringify(result));
        multi.expire(this.resultKey, this.resultTTL);
        
        try {
            await multi.exec();
        } catch (err) {
            throw new GlitchError(`Failed to store result: ${err instanceof Error ? err.message : String(err)}`, 2008);
        }
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
