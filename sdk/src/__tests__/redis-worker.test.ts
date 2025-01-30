import { jest } from '@jest/globals';
import { RedisQueueWorkerImpl } from '../queue/redis-worker.js';
import { ChaosRequest, TestResult, TestType } from '../types.js';
import IoRedisMock from '../__mocks__/ioredis.js';

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorkerImpl;
    let redis: IoRedisMock;

    beforeEach(async () => {
        redis = new IoRedisMock({
            host: 'localhost',
            port: 6379
        });

        worker = new RedisQueueWorkerImpl(redis as any);
        await worker.initialize();
    });

    afterEach(async () => {
        await worker.close();
    });

    describe('Request Operations', () => {
        const params: ChaosRequest = {
            id: '1',
            requestId: 'test-1',
            params: {
                targetProgram: 'test-program',
                testType: TestType.FUZZ,
                duration: 60,
                intensity: 5,
                securityLevel: 2,
                executionEnvironment: 'sgx'
            },
            status: 'pending' as const,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        it('should enqueue and get request', async () => {
            const requestId = await worker.enqueueRequest(params);
            expect(requestId).toBe(params.requestId);

            const request = await worker.getRequest(requestId);
            expect(request).toEqual(params);
        });

        it('should update request', async () => {
            await worker.enqueueRequest(params);
            const updatedRequest: ChaosRequest = {
                ...params,
                status: 'completed' as const
            };
            await worker.updateRequest(updatedRequest);
            const request = await worker.getRequest(params.requestId);
            expect(request).toEqual(updatedRequest);
        });

        it('should handle missing request', async () => {
            const request = await worker.getRequest('non-existent');
            expect(request).toBeNull();
        });
    });

    describe('Test Result Operations', () => {
        const result: TestResult = {
            requestId: 'test-1',
            status: 'success',
            findings: [],
            metrics: {
                totalTransactions: 100,
                successfulTransactions: 95,
                failedTransactions: 5,
                averageBlockTime: 0.5,
                cpuUtilization: 60,
                memoryUsage: 80,
                testDuration: 300
            },
            completedAt: Date.now()
        };

        it('should store and get result', async () => {
            await worker.storeResult(result.requestId, result);
            const storedResult = await worker.getResult(result.requestId);
            expect(storedResult).toEqual(result);
        });

        it('should handle missing result', async () => {
            const storedResult = await worker.getResult('non-existent');
            expect(storedResult).toBeNull();
        });
    });

    describe('Queue Operations', () => {
        const requests: ChaosRequest[] = [
            {
                id: '1',
                requestId: 'test-1',
                params: {
                    targetProgram: 'test-program',
                    testType: TestType.FUZZ,
                    duration: 60,
                    intensity: 5,
                    securityLevel: 2,
                    executionEnvironment: 'sgx'
                },
                status: 'pending' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            {
                id: '2',
                requestId: 'test-2',
                params: {
                    targetProgram: 'test-program-2',
                    testType: TestType.FUZZ,
                    duration: 120,
                    intensity: 7,
                    securityLevel: 3,
                    executionEnvironment: 'sgx'
                },
                status: 'pending' as const,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        ];

        it('should process requests in FIFO order', async () => {
            // Enqueue requests
            for (const request of requests) {
                await worker.enqueueRequest(request);
            }

            // Dequeue and verify order
            for (const expectedRequest of requests) {
                const request = await worker.dequeueRequest();
                expect(request).toEqual(expectedRequest);
            }

            // Queue should be empty
            const emptyRequest = await worker.dequeueRequest();
            expect(emptyRequest).toBeNull();
        });
    });

    describe('Error Handling', () => {
        it('should handle Redis connection errors', async () => {
            const errorRedis = new IoRedisMock({
                host: 'invalid-host',
                port: 1234
            });
            
            // Mock connection error
            jest.spyOn(errorRedis, 'connect').mockRejectedValueOnce(new Error('Connection failed'));
            
            const errorWorker = new RedisQueueWorkerImpl(errorRedis as any);
            await expect(errorWorker.initialize()).rejects.toThrow('Connection failed');
        });
    });
});
