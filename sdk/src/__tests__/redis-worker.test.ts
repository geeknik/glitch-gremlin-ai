import { jest } from '@jest/globals';
import { RedisQueueWorker } from '../queue/redis-worker.js';
import { TestType } from '../types.js';
import { Redis } from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import type { Callback } from 'ioredis';

interface MockRedis extends Omit<RedisType, 'quit' | 'disconnect' | 'on' | 'incr' | 'expire' | 'get' | 'set' | 'flushall' | 'hset' | 'hget' | 'lpush' | 'rpop'> {
    queue: string[];
    connected: boolean;
    quit: jest.MockedFunction<() => Promise<'OK'>>;
    disconnect: jest.MockedFunction<() => Promise<void>>;
    on: jest.MockedFunction<(event: string, callback: Function) => void>;
    incr: jest.MockedFunction<(key: string) => Promise<number>>;
    expire: jest.MockedFunction<(key: string, seconds: number) => Promise<number>>;
    get: jest.MockedFunction<(key: string) => Promise<string | null>>;
    set: jest.MockedFunction<(key: string, value: string) => Promise<'OK'>>;
    flushall: jest.MockedFunction<() => Promise<'OK'>>;
    hset: jest.MockedFunction<(key: string, field: string, value: string) => Promise<number>>;
    hget: jest.MockedFunction<(key: string, field: string) => Promise<string | null>>;
    lpush: jest.MockedFunction<(key: string, value: string) => Promise<number>>;
    rpop: jest.MockedFunction<(key: string) => Promise<string | null>>;
}
    disconnect: jest.fn().mockImplementation(async (): Promise<void> => {
        redisMock.connected = false;
    }),
    on: jest.fn();
    incr: jest.fn().mockImplementation(async (key: string): Promise<number> => {
        if (redisMock.connected === false) {
            throw new GlitchError('Connection failed', ErrorCode.CONNECTION_ERROR);
        }
        return 1;
    }),
    expire: jest.fn().mockImplementation(async (key: string, seconds: number): Promise<number> => 1);
    get: jest.fn().mockImplementation(async (key: string): Promise<string | null> => null);
    set: jest.fn().mockImplementation(async (key: string, value: string): Promise<'OK'> => 'OK');
    flushall: jest.fn().mockImplementation(async (): Promise<'OK'> => 'OK');
    hset: jest.fn().mockImplementation(async (key: string, field: string, value: string): Promise<number> => {
        if (typeof value !== 'string') {
            throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
        }
        return 1;
    }),
    hget: jest.fn().mockImplementation(async (key: string, field: string): Promise<string | null> => {
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
    lpush: jest.fn().mockImplementation(async (key: string, value: string): Promise<number> => {
        if (value === 'invalid-json') {
            throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
        }
        redisMock.queue.push(value);
        return 1;
    }),
    rpop: jest.fn().mockImplementation(async (key: string): Promise<string | null> => {
        if (key === 'empty-queue') {
            return null;
        }
        return redisMock.queue.length > 0 ? redisMock.queue.shift() : null;
    })
};
import { GlitchError } from '../errors.js';
import { ErrorCode } from '../errors.js';
// Increase timeout for all tests
jest.setTimeout(30000);

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorker;
    let redis: MockRedis;

    beforeAll(() => {
        // Enhanced Redis mock with proper error handling and typed implementations
        const redisMock: MockRedis = {
            connected: true,
            queue: [] as string[],
            incr: jest.fn().mockImplementation(async (key: string): Promise<number> => {
                if (redisMock.connected === false) {
                    throw new GlitchError('Connection failed', ErrorCode.CONNECTION_ERROR);
                }
                return 1;
            }),
            expire: jest.fn().mockImplementation(async (key: string, seconds: number): Promise<number> => 1),
            get: jest.fn().mockImplementation(async (key: string): Promise<string | null> => null),
            set: jest.fn().mockImplementation(async (key: string, value: string): Promise<'OK'> => 'OK'),
            on: jest.fn(),
            quit: jest.fn().mockImplementation(async (): Promise<'OK'> => {
                redisMock.connected = false;
                return 'OK';
            }),
            disconnect: jest.fn().mockImplementation(async (): Promise<void> => {
                    redisMock.connected = false;
                }),
            flushall: jest.fn().mockImplementation(async (): Promise<'OK'> => 'OK'),
            hset: jest.fn().mockImplementation(async (key: string, field: string, value: string): Promise<number> => {
                if (typeof value !== 'string') {
                    throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
                }
                return 1;
            }),
            hget: jest.fn().mockImplementation(async (key: string, field: string): Promise<string | null> => {
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
            lpush: jest.fn().mockImplementation(async (key: string, value: string): Promise<number> => {
                if (value === 'invalid-json') {
                    throw new GlitchError('Invalid JSON', ErrorCode.INVALID_JSON);
                }
                redisMock.queue.push(value);
                return 1;
            }),
            rpop: jest.fn().mockImplementation(async (key: string): Promise<string | null> => {
                if (key === 'empty-queue') {
                    return null;
                }
                return redisMock.queue.length > 0 ? redisMock.queue.shift() : null;
            })
        };

        redis = redisMock;
    });

    beforeEach(() => {
        worker = new RedisQueueWorker(redis);
    });

    afterEach(async () => {
        try {
            await worker.close();
            await redis.flushall();
            await redis.quit();
            await redis.disconnect();
        } catch (error) {
            console.error('Error in test cleanup:', error);
        }
    });

    describe('queue operations', () => {
        it('should enqueue and dequeue requests', async () => {
            const params = {
                targetProgram: "11111111111111111111111111111111",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            };

            // Enqueue request
            const requestId = await worker.enqueueRequest(params);
            expect(requestId).toBeDefined();
            expect(typeof requestId).toBe('string');
            expect(requestId.length).toBeGreaterThan(0);

            // Dequeue request
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

    describe('result storage', () => {
        it('should store and retrieve results', async () => {
            const requestId = 'test-request-id';
            const result = {
                requestId,
                status: 'completed' as const,
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
                status: 'completed' as const,
                resultRef: 'ipfs://test',
                logs: ['Test completed'],
                metrics: {
                    totalTransactions: 100,
                    errorRate: 0,
                    avgLatency: 100
                }
            };

            await worker.storeResult(requestId, result);
            
            // Advance time by 25 hours
            jest.advanceTimersByTime(25 * 60 * 60 * 1000);
            
            const retrieved = await worker.getResult(requestId);
            expect(retrieved).toBeNull();
            
            jest.useRealTimers();
        });
    });

    describe('error handling', () => {
        it('should throw on connection failure', async () => {
            // Mock lpush to throw connection error
            // Mock lpush to throw connection error
            redis.lpush.mockImplementationOnce((key: string, value: string) => 
                Promise.reject(new GlitchError('Connection failed', ErrorCode.CONNECTION_ERROR))
            );
            await expect(worker.enqueueRequest({
                targetProgram: "1",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            })).rejects.toThrow('Connection failed');
        });

        it('should handle malformed queue data', async () => {
            // Mock rpop to return invalid JSON
            redis.rpop.mockImplementationOnce((key: string) => Promise.resolve('invalid-json'));
            
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
            // Mock hget to throw GlitchError for bad result
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
