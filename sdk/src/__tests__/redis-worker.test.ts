import { RedisQueueWorker } from '../queue/redis-worker.js';
import { TestType } from '../types.js';
import type { Redis as RedisType } from 'ioredis';
import { GlitchError } from '../errors.js';

// Create a mock Redis client
const createMockRedis = () => {
    const store: { [key: string]: any } = {};
    const hashStore: { [key: string]: { [field: string]: string } } = {};
    const expirations: { [key: string]: number } = {};
    const rateLimitStore: { [key: string]: number } = {};

    interface MockRedis {
        [key: string]: any;
        connected: boolean;
        incr: jest.Mock;
        expire: jest.Mock;
        get: jest.Mock;
        set: jest.Mock;
        hset: jest.Mock;
        hget: jest.Mock;
        lpush: jest.Mock;
        rpop: jest.Mock;
        hdel: jest.Mock;
        flushall: jest.Mock;
        quit: jest.Mock;
        disconnect: jest.Mock;
        on: jest.Mock;
        keys: jest.Mock;
        del: jest.Mock;
        multi: jest.Mock;
        hincrby: jest.Mock;
    }

    const mockRedis: MockRedis = {
        connected: true,
        incr: jest.fn().mockImplementation(async (key: string) => {
            if (key.includes('ratelimit')) {
                rateLimitStore[key] = (rateLimitStore[key] || 0) + 1;
                return rateLimitStore[key];
            }
            store[key] = (store[key] || 0) + 1;
            return store[key];
        }),
        expire: jest.fn().mockImplementation((key: string, seconds: number) => {
            expirations[key] = Date.now() + seconds * 1000;
            return Promise.resolve(1);
        }),
        get: jest.fn().mockImplementation((key: string) => {
            if (expirations[key] && Date.now() > expirations[key]) {
                delete store[key];
                delete expirations[key];
                return Promise.resolve(null);
            }
            return Promise.resolve(store[key] || null);
        }),
        set: jest.fn().mockImplementation((key: string, value: string) => {
            store[key] = value;
            return Promise.resolve('OK');
        }),
        hset: jest.fn().mockImplementation((key: string, field: string, value: string) => {
            if (!hashStore[key]) {
                hashStore[key] = {};
            }
            hashStore[key][field] = value;
            return Promise.resolve(1);
        }),
        hget: jest.fn().mockImplementation((key: string, field: string) => {
            if (expirations[key] && Date.now() > expirations[key]) {
                delete hashStore[key];
                delete expirations[key];
                return Promise.resolve(null);
            }
            return Promise.resolve(hashStore[key]?.[field] || null);
        }),
        hincrby: jest.fn().mockImplementation((key: string, field: string, increment: number) => {
            if (!hashStore[key]) {
                hashStore[key] = {};
            }
            const currentValue = parseInt(hashStore[key][field] || '0', 10);
            hashStore[key][field] = String(currentValue + increment);
            return Promise.resolve(currentValue + increment);
        }),
        lpush: jest.fn().mockImplementation((key: string, value: string) => {
            if (!store[key]) {
                store[key] = [];
            }
            store[key].unshift(value);
            return Promise.resolve(store[key].length);
        }),
        rpop: jest.fn().mockImplementation((key: string) => {
            if (!store[key] || !store[key].length) {
                return Promise.resolve(null);
            }
            return Promise.resolve(store[key].pop());
        }),
        hdel: jest.fn().mockImplementation((key: string, field: string) => {
            if (hashStore[key] && hashStore[key][field]) {
                delete hashStore[key][field];
                return Promise.resolve(1);
            }
            return Promise.resolve(0);
        }),
        flushall: jest.fn().mockImplementation(() => {
            Object.keys(store).forEach(key => delete store[key]);
            Object.keys(hashStore).forEach(key => delete hashStore[key]);
            Object.keys(expirations).forEach(key => delete expirations[key]);
            return Promise.resolve('OK');
        }),
        quit: jest.fn().mockImplementation(() => Promise.resolve('OK')),
        disconnect: jest.fn().mockImplementation(() => Promise.resolve()),
        on: jest.fn().mockImplementation(() => mockRedis),
        keys: jest.fn().mockImplementation((pattern: string) => {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return Promise.resolve(Object.keys(store).filter(key => regex.test(key)));
        }),
        del: jest.fn().mockImplementation((...keys: string[]) => {
            let count = 0;
            keys.forEach(key => {
                if (store[key]) {
                    delete store[key];
                    count++;
                }
                if (hashStore[key]) {
                    delete hashStore[key];
                    count++;
                }
                if (expirations[key]) {
                    delete expirations[key];
                }
            });
            return Promise.resolve(count);
        }),
        multi: jest.fn().mockImplementation(() => {
            const commands: Array<[string, ...any[]]> = [];
            const multiInterface = {
                hset: (key: string, field: string, value: string) => {
                    commands.push(['hset', key, field, value]);
                    return multiInterface;
                },
                expire: (key: string, seconds: number) => {
                    commands.push(['expire', key, seconds]);
                    return multiInterface;
                },
                incr: (key: string) => {
                    commands.push(['incr', key]);
                    return multiInterface;
                },
                lpush: (key: string, value: string) => {
                    commands.push(['lpush', key, value]);
                    return multiInterface;
                },
                hincrby: (key: string, field: string, increment: number) => {
                    commands.push(['hincrby', key, field, increment]);
                    return multiInterface;
                },
                exec: async () => {
                    const results = [];
                    for (const [cmd, ...args] of commands) {
                        try {
                            if (cmd === 'incr' && args[0].includes('glitch:chaos:ratelimit')) {
                                const key = args[0];
                                rateLimitStore[key] = (rateLimitStore[key] || 0) + 1;
                                // FUZZ type has a limit of 30 requests
                                if (rateLimitStore[key] > 30) {
                                    results.push([null, rateLimitStore[key]]); // Return actual count to trigger rate limit check
                                } else {
                                    results.push([null, rateLimitStore[key]]);
                                }
                            } else if (cmd === 'expire') {
                                const [key, seconds] = args;
                                expirations[key] = Date.now() + seconds * 1000;
                                results.push([null, 1]);
                            } else if (cmd === 'lpush') {
                                const [key, value] = args;
                                if (!store[key]) store[key] = [];
                                store[key].unshift(value);
                                results.push([null, store[key].length]);
                            } else if (cmd === 'hincrby') {
                                const [key, field, increment] = args;
                                if (!hashStore[key]) hashStore[key] = {};
                                hashStore[key][field] = String(
                                    (parseInt(hashStore[key][field] || '0') + increment)
                                );
                                results.push([null, parseInt(hashStore[key][field])]);
                            } else if (cmd === 'hset') {
                                const [key, field, value] = args;
                                if (!hashStore[key]) hashStore[key] = {};
                                hashStore[key][field] = value;
                                results.push([null, 1]);
                            } else {
                                const result = await mockRedis[cmd](...args);
                                results.push([null, result]);
                            }
                        } catch (error) {
                            results.push([error, null]);
                        }
                    }
                    return results;
                }
            };
            return multiInterface;
        })
    };

    return mockRedis as unknown as RedisType;
};

jest.mock('ioredis', () => ({
    default: jest.fn().mockImplementation(() => createMockRedis())
}));

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorker;
    let redis: RedisType;
    const store: { [key: string]: any } = {};
    const hashStore: { [key: string]: { [field: string]: string } } = {};
    const expirations: { [key: string]: number } = {};
    const rateLimitStore: { [key: string]: number } = {};

    beforeEach(() => {
        // Clear stores before each test
        Object.keys(store).forEach(key => delete store[key]);
        Object.keys(rateLimitStore).forEach(key => delete rateLimitStore[key]);
        redis = createMockRedis();
        worker = new RedisQueueWorker(redis);
    });

    afterEach(async () => {
        await worker.close();
        await redis.flushall();
        await redis.quit();
        await redis.disconnect();
    });

    it('should enqueue and dequeue requests', async () => {
        const params = {
            targetProgram: "11111111111111111111111111111111",
            testType: TestType.FUZZ,
            duration: 60,
            intensity: 5,
            securityLevel: 3, // High security level
            executionEnvironment: 'sgx' as const // Using SGX for secure execution
        };

        const requestId = await worker.enqueueRequest(params);
        expect(requestId).toBeDefined();

        const dequeued = await worker.dequeueRequest();
        expect(dequeued).toBeDefined();
        expect(dequeued?.params).toEqual(params);
    });

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

    it('should expire results after TTL', async () => {
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
        
        // Simulate expiration by directly calling hdel
        await redis.hdel(worker['resultKey'], requestId);
        
        const expiredResult = await worker.getResult(requestId);
        expect(expiredResult).toBeNull();
    });

    it('should handle rate limiting', async () => {
        const params = {
            targetProgram: "11111111111111111111111111111111",
            testType: TestType.FUZZ,
            duration: 60,
            intensity: 5,
            securityLevel: 3, // High security level
            executionEnvironment: 'sgx' as const // Using SGX for secure execution
        };

        // Make multiple requests
        const requests = [];
        let rateLimitHit = false;

        for (let i = 0; i < 40; i++) { // Try to make 40 requests (limit is 30)
            try {
                const requestId = await worker.enqueueRequest(params);
                console.log(`Request ${i + 1} succeeded with ID: ${requestId}`);
                requests.push(requestId);
            } catch (error) {
                console.log(`Request ${i + 1} failed with error:`, error);
                if (error instanceof GlitchError && error.message.includes('Rate limit exceeded')) {
                    rateLimitHit = true;
                    break;
                }
                throw error;
            }
            // Add a small delay between requests to ensure proper ordering
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        console.log('Rate limit hit:', rateLimitHit);
        console.log('Total successful requests:', requests.length);

        expect(rateLimitHit).toBe(true);
        expect(requests.length).toBe(30); // Should hit exactly the limit
    });
});
