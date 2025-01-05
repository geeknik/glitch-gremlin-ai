import { RedisQueueWorker } from '../queue/redis-worker';
import { TestType } from '../types';

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorker;

    beforeEach(() => {
        worker = new RedisQueueWorker();
    });

    afterEach(async () => {
        await worker.close();
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
});