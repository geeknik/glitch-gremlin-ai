import { jest } from '@jest/globals';
import { RedisQueueWorker } from '../queue/redis-worker.js';
import { TestType } from '../types.js';
import { Redis } from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import type { Callback } from 'ioredis';

interface MockRedis extends RedisType {
    queue: string[];
    connected: boolean;
    quit: jest.Mock<Promise<'OK'>>;
    disconnect: jest.Mock<Promise<void>>;
    on: jest.Mock<RedisType['on']>;
    incr: jest.Mock<Promise<number>>;
    expire: jest.Mock<Promise<number>>;
    get: jest.Mock<Promise<string | null>>;
    set: jest.Mock<Promise<'OK'>>;
    flushall: jest.Mock<Promise<'OK'>>;
    hset: jest.Mock<Promise<number>>;
    hget: jest.Mock<Promise<string | null>>;
    hgetall: jest.Mock<Promise<Record<string, string>>>;
    lpush: jest.Mock<Promise<number>>;
    rpop: jest.Mock<Promise<string | null>>;
    keys: jest.Mock<Promise<string[]>>;
    del: jest.Mock<Promise<number>>;
    multi: jest.Mock<any>;
    exec: jest.Mock<any>;
}

import { GlitchError } from '../errors.js';
import { ErrorCode } from '../errors.js';
// Increase timeout for all tests
jest.setTimeout(30000);

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorker;
    let redis: MockRedis;

    import { RateLimitConfig } from '../types.js';

    beforeAll(() => {
        const redisMock: MockRedis = {
            connected: true,
            queue: [] as string[],
            rateLimits: new Map<string, RateLimitConfig>(),
            exec: jest.fn().mockImplementation(async function(this: MockRedis) {
                return this.execCommands || [];
            }),
            execCommands: [] as any[],
            del: jest.fn().mockImplementation(async (...keys: string[]) => {
                return keys.length;
            }),
            hgetall: jest.fn().mockImplementation(async (key: string) => {
                return {
                    total: '10',
                    active: '5'
                };
            }),
            multi: jest.fn().mockReturnThis(),
            quit: jest.fn().mockImplementation(async () => {
                redisMock.connected = false;
                return 'OK';
            }),
            disconnect: jest.fn().mockImplementation(async () => {
                redisMock.connected = false;
            }),
            on: jest.fn(),
            incr: jest.fn().mockImplementation(async (key) => {
                if (redisMock.connected === false) {
                    throw new GlitchError('Connection failed', ErrorCode.CONNECTION_ERROR);
                }
                return 1;
            }),
            expire: jest.fn().mockImplementation(async () => 1),
            get: jest.fn().mockImplementation(async () => null),
            set: jest.fn().mockImplementation(async () => 'OK'),
            flushall: jest.fn().mockImplementation(async () => 'OK'),
            hset: jest.fn().mockImplementation(async (key, field, value) => {
                if (typeof value !== 'string') {
                    throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
                }
                return 1;
            }),
            hget: jest.fn().mockImplementation(async (key, field) => {
                if (field === 'bad-result') {
                    throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
                }
                if (field === 'non-existent-id') {
                    return null;
                }
                return JSON.stringify({
                    requestId: field,
                    status: 'completed',
                    resultRef: 'ipfs://test',
                    logs: ['Test completed'],
                    metrics: {
                        totalTransactions: 100,
                        errorRate: 0,
                        avgLatency: 100
                    }
                });
            }),
            lpush: jest.fn().mockImplementation(async (key, value) => {
                if (value === 'invalid-json') {
                    throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
                }
                redisMock.queue.push(value);
                return 1;
            }),
            rpop: jest.fn().mockImplementation(async (key) => {
                if (key === 'empty-queue') {
                    return null;
                }
                return redisMock.queue.length > 0 ? redisMock.queue.shift() : null;
            })
        } as unknown as MockRedis;
        redis = redisMock;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        redis.queue = [];
        redis.execCommands = [];
        redis.rateLimits.clear();
        worker = new RedisQueueWorker(redis);
    });

    afterEach(async () => {
        jest.useRealTimers();
        redis.queue = [];
        redis.execCommands = [];
        redis.rateLimits.clear();
        
        try {
            await worker.close();
            await redis.flushall();
        } catch (error) {
            console.error('Error in test cleanup:', error);
        }
    });

    describe('rate limiting', () => {
        it('should enforce rate limits per request type', async () => {
            const requestType = 'TEST';
            const config: RateLimitConfig = {
                maxRequests: 2,
                interval: 1000  // 1 second
            };

            redis.get.mockImplementation(async (key: string) => {
                if (key.includes('ratelimit')) {
                    return '1';  // Current count
                }
                return null;
            });

            // First request should succeed
            await expect(worker.checkRateLimit(requestType)).resolves.toBe(true);
            
            // Second request hits limit
            redis.get.mockResolvedValueOnce('2');
            await expect(worker.checkRateLimit(requestType)).resolves.toBe(false);
        });

        it('should reset rate limit after interval', async () => {
            const requestType = 'TEST';
            
            redis.get.mockResolvedValueOnce('1');
            await worker.checkRateLimit(requestType);

            // Advance timer past rate limit interval
            jest.advanceTimersByTime(1100);

            redis.get.mockResolvedValueOnce(null);  // Counter expired
            await expect(worker.checkRateLimit(requestType)).resolves.toBe(true);
        });
    });

    describe('queue operations', () => {
        it('should enqueue and dequeue requests', async () => {
            const params = {
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            };

            const requestId = await worker.enqueueRequest(params);
            expect(requestId).toBeDefined();
            expect(typeof requestId).toBe('string');
            expect(requestId.length).toBeGreaterThan(0);

            const dequeued = await worker.dequeueRequest();
            expect(dequeued).toBeDefined();
            expect(dequeued?.params).toEqual(params);
            expect(dequeued?.id).toBe(requestId);
            expect(typeof dequeued?.timestamp).toBe('number');
        });

        it('should handle empty queue', async () => {
            const dequeued = await worker.dequeueRequest();
            expect(dequeued).toBeNull();
            expect(redis.rpop).toHaveBeenCalled();
        });

        it('should maintain FIFO order', async () => {
            const params1 = { targetProgram: "1", testType: TestType.FUZZ, duration: 60, intensity: 5 };
            const params2 = { targetProgram: "2", testType: TestType.LOAD, duration: 120, intensity: 7 };

            await worker.enqueueRequest(params1);
            await worker.enqueueRequest(params2);

            const first = await worker.dequeueRequest();
            const second = await worker.dequeueRequest();

            expect(first?.params).toEqual(params1);
            expect(second?.params).toEqual(params2);
        });
    });

    describe('queue lifecycle', () => {
        it('should handle queue worker startup and shutdown', async () => {
            const worker = new RedisQueueWorker(redis);
            await expect(worker.initialize()).resolves.not.toThrow();
            
            expect(redis.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(redis.on).toHaveBeenCalledWith('connect', expect.any(Function));
            
            await expect(worker.close()).resolves.not.toThrow();
            expect(redis.quit).toHaveBeenCalled();
            expect(redis.disconnect).toHaveBeenCalled();
        });

        it('should handle redis connection failures gracefully', async () => {
            redis.connected = false;
            const worker = new RedisQueueWorker(redis);
            
            await expect(worker.initialize()).rejects.toThrow('Redis connection failed');
        });
    });

    describe('result storage', () => {
        it('should store and retrieve results', async () => {
            const requestId = 'test-request-id';
            const result = {
                requestId,
                status: 'completed',
                resultRef: 'ipfs://test',
                logs: ['Test completed'],
                metrics: {
                    totalTransactions: 100,
                    errorRate: 0,
                    avgLatency: 100
                }
            };

            await worker.storeResult(requestId, result);
            const retrieved = await worker.getResult(requestId);
            expect(retrieved).toEqual(result);
        });

        it('should return null for missing results', async () => {
            const result = await worker.getResult('non-existent-id');
            expect(result).toBeNull();
        });

        it('should expire results after TTL', async () => {
            jest.useFakeTimers();

            const requestId = 'test-request-id';
            const result = {
                requestId,
                status: 'completed',
                resultRef: 'ipfs://test',
                logs: ['Test completed'],
                metrics: {
                    totalTransactions: 100,
                    errorRate: 0,
                    avgLatency: 100
                }
            };

            await worker.storeResult(requestId, result);

            jest.advanceTimersByTime(25 * 60 * 60 * 1000);

            const retrieved = await worker.getResult(requestId);
            expect(retrieved).toBeNull();

            jest.useRealTimers();
        });
    });

    describe('error handling', () => {
        it('should throw on connection failure', async () => {
            redis.lpush.mockImplementationOnce(() => Promise.reject(new GlitchError('Connection failed', ErrorCode.CONNECTION_ERROR)));
            await expect(worker.enqueueRequest({
                targetProgram: "1",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            })).rejects.toThrow('Connection failed');
        });

        it('should handle malformed queue data', async () => {
            redis.rpop.mockImplementationOnce(() => Promise.resolve('invalid-json'));
            await expect(worker.dequeueRequest()).rejects.toThrow(SyntaxError);
        });

        it('should handle connection errors during enqueue', async () => {
            await redis.quit();
            await expect(worker.enqueueRequest({
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            })).rejects.toThrow(GlitchError);
        });

        it('should handle connection errors during dequeue', async () => {
            await redis.quit();
            await expect(worker.dequeueRequest()).rejects.toThrow(GlitchError);
        });

        it('should handle connection errors during result storage', async () => {
            await redis.quit();
            await expect(worker.storeResult('test-id', {
                requestId: 'test-id',
                status: 'completed',
                resultRef: 'ipfs://test',
                logs: ['Test completed'],
                metrics: {
                    totalTransactions: 100,
                    errorRate: 0,
                    avgLatency: 100
                }
            })).rejects.toThrow(GlitchError);
        });

        it('should handle malformed result data', async () => {
            redis.hget.mockImplementationOnce((key: string, field: string) => {
                if (field === 'bad-result') {
                    throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
                }
                return null;
            });
            await expect(worker.getResult('bad-result')).rejects.toThrow(GlitchError);
        });
    });
});
