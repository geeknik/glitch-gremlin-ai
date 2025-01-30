import { jest } from '@jest/globals';
import { RedisQueueWorkerImpl } from '../queue/redis-worker.js';
import { ChaosRequest, TestResult, TestType } from '../types.js';
import IoRedisMock from '../__mocks__/ioredis.js';

describe('RedisQueueWorker', () => {
    let worker: RedisQueueWorkerImpl;
    let mockRedis: IoRedisMock;

    beforeEach(async () => {
        mockRedis = new IoRedisMock({
            host: 'localhost',
            port: 6379
        });

        worker = new RedisQueueWorkerImpl(mockRedis as any);
        await worker.initialize();
    });

    afterEach(async () => {
        await worker.close();
    });

    describe('Request Queue Operations', () => {
        const mockRequest: ChaosRequest = {
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

        it('should enqueue and dequeue requests', async () => {
            const requestId = await worker.enqueueRequest(mockRequest);
            expect(requestId).toBe(mockRequest.requestId);

            const dequeued = await worker.dequeueRequest();
            expect(dequeued).toEqual(mockRequest);
        });

        it('should get request by id', async () => {
            await worker.enqueueRequest(mockRequest);
            const retrieved = await worker.getRequest(mockRequest.requestId);
            expect(retrieved).toEqual(mockRequest);
        });

        it('should update request', async () => {
            await worker.enqueueRequest(mockRequest);
            const updatedRequest: ChaosRequest = {
                ...mockRequest,
                status: 'completed' as const
            };
            await worker.updateRequest(updatedRequest);
            const retrieved = await worker.getRequest(mockRequest.requestId);
            expect(retrieved).toEqual(updatedRequest);
        });
    });

    describe('Test Result Operations', () => {
        const mockResult: TestResult = {
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

        it('should store and retrieve test results', async () => {
            await worker.storeResult(mockResult.requestId, mockResult);
            const retrieved = await worker.getResult(mockResult.requestId);
            expect(retrieved).toEqual(mockResult);
        });

        it('should handle missing results', async () => {
            const result = await worker.getResult('non-existent');
            expect(result).toBeNull();
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