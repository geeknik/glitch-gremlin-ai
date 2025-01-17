import { RedisQueueWorker } from '../queue/redis-worker';
import { TestType } from '../types';
import RedisMock from 'ioredis-mock';
jest.mock('ioredis', () => require('ioredis-mock'));
describe('RedisQueueWorker', () => {
    let worker;
    let redis;
    beforeEach(() => {
        redis = new RedisMock();
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
            intensity: 5
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
        const initialResult = await worker.getResult(requestId);
        expect(initialResult).toEqual(result);

        // Advance time past TTL
        jest.advanceTimersByTime(3600 * 1000); // 1 hour

        const expiredResult = await worker.getResult(requestId);
        expect(expiredResult).toBeNull();

        jest.useRealTimers();
    });
