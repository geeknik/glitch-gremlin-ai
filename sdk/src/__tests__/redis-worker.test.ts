import { jest } from '@jest/globals';
import { RedisQueueWorker } from '../queue/redis-worker.js';
import { TestType } from '../types.js';
import { Redis } from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { GlitchError } from '../errors.js';

// Increase timeout for all tests
jest.setTimeout(30000);

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorker;
    let redis: RedisType;

    beforeAll(() => {
        // Enhanced Redis mock with error handling
        redis = {
            incr: jest.fn().mockImplementation(async () => {
                if (this.connected === false) {
                    throw new GlitchError('Connection failed');
                }
                return 1;
            }),
            expire: jest.fn().mockResolvedValue(1),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            on: jest.fn(),
            quit: jest.fn().mockImplementation(async function() {
                (this as any).connected = false;
                return 'OK';
            }),
            disconnect: jest.fn().mockImplementation(async function() {
                (this as any).connected = false;
                return 'OK';
            }),
            flushall: jest.fn().mockResolvedValue('OK'),
            hset: jest.fn().mockImplementation(async (key, field, value) => {
                if (typeof value !== 'string') {
                    throw new SyntaxError('Invalid JSON');
                }
                return 1;
            }),
            hget: jest.fn().mockImplementation(async (key, field) => {
                if (field === 'bad-result') {
                    throw new SyntaxError('Invalid JSON');
                }
                return JSON.stringify({test: 'data'});
            }),
            lpush: jest.fn().mockImplementation(async (key, value) => {
                if (value === 'invalid-json') {
                    throw new SyntaxError('Invalid JSON');
                }
                return 1;
            }),
            rpop: jest.fn().mockImplementation(async function(key) {
                if (key === 'empty-queue') {
                    return null;
                }
                // Return the actual queued data
                const queue = this.queue || [];
                return queue.length > 0 ? queue.shift() : null;
            }),
            lpush: jest.fn().mockImplementation(async function(key, value) {
                if (!this.queue) {
                    this.queue = [];
                }
                this.queue.push(value);
                return 1;
            })
            connected: true
        } as unknown as Redis;
    });

    beforeEach(() => {
        worker = new RedisQueueWorker(redis);
    });

    afterEach(async () => {
        await worker.close();
        await redis.flushall();
        await redis.quit();
        await redis.disconnect();
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

            const dequeued = await worker.dequeueRequest();
            expect(dequeued).toBeDefined();
            expect(dequeued?.params).toEqual(params);
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
            await redis.quit();
            
            await expect(worker.enqueueRequest({
                targetProgram: "1",
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5
            })).rejects.toThrow(GlitchError);
        });

        it('should handle malformed queue data', async () => {
            await redis.lpush(worker['queueKey'], 'invalid-json');
        
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
            await redis.hset(worker['resultKey'], 'bad-result', 'invalid-json');
            
            await expect(worker.getResult('bad-result')).rejects.toThrow(SyntaxError);
        });
    });
});
