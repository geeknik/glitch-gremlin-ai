import { Redis } from 'ioredis';
import { ChaosRequest, TestResult } from '../types.js';

export interface RedisQueueWorker {
    initialize(): Promise<void>;
    close(): Promise<void>;
    isInitialized(): boolean;
    enqueueRequest(request: ChaosRequest): Promise<string>;
    getRequest(requestId: string): Promise<ChaosRequest | null>;
    updateRequest(request: ChaosRequest): Promise<void>;
    getTestResult(requestId: string): Promise<TestResult | null>;
    dequeueRequest(): Promise<ChaosRequest | null>;
    storeResult(requestId: string, result: TestResult): Promise<void>;
    getResult(requestId: string): Promise<TestResult | null>;
    getRawClient(): Redis;
}

export class RedisQueueWorkerImpl implements RedisQueueWorker {
    private redis: Redis;
    private initialized: boolean = false;
    private readonly requestKey = 'chaos:requests';
    private readonly resultKey = 'chaos:results';

    constructor(redis: Redis) {
        this.redis = redis;
    }

    public async initialize(): Promise<void> {
        if (!this.initialized) {
            await this.redis.connect();
            this.initialized = true;
        }
    }

    public async close(): Promise<void> {
        if (this.initialized) {
            await this.redis.quit();
            this.initialized = false;
        }
    }

    public isInitialized(): boolean {
        return this.initialized;
    }

    public async enqueueRequest(request: ChaosRequest): Promise<string> {
        const requestId = request.requestId;
        await this.redis.lpush(this.requestKey, JSON.stringify(request));
        await this.redis.set(`${this.requestKey}:${requestId}`, JSON.stringify(request));
        return requestId;
    }

    public async getRequest(requestId: string): Promise<ChaosRequest | null> {
        const data = await this.redis.get(`${this.requestKey}:${requestId}`);
        return data ? JSON.parse(data) : null;
    }

    public async updateRequest(request: ChaosRequest): Promise<void> {
        await this.redis.set(
            `${this.requestKey}:${request.requestId}`,
            JSON.stringify(request)
        );
    }

    public async getTestResult(requestId: string): Promise<TestResult | null> {
        const data = await this.redis.get(`${this.resultKey}:${requestId}`);
        return data ? JSON.parse(data) : null;
    }

    public async dequeueRequest(): Promise<ChaosRequest | null> {
        const data = await this.redis.rpop(this.requestKey);
        return data ? JSON.parse(data) : null;
    }

    public async storeResult(requestId: string, result: TestResult): Promise<void> {
        await this.redis.set(`${this.resultKey}:${requestId}`, JSON.stringify(result));
    }

    public async getResult(requestId: string): Promise<TestResult | null> {
        const data = await this.redis.get(`${this.resultKey}:${requestId}`);
        return data ? JSON.parse(data) : null;
    }

    public getRawClient(): Redis {
        return this.redis;
    }
}
