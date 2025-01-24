import { Redis } from 'ioredis';

export class RedisQueueWorker {
    private client: Redis;
    private initialized: boolean = false;

    constructor(redisClient: Redis) {
        this.client = redisClient;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        if (!this.client) {
            throw new Error('Redis client not initialized');
        }

        try {
            await this.client.ping();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize Redis connection:', error);
            this.initialized = false;
            throw error;
        }
    }

    async getRawClient(): Promise<Redis> {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.client;
    }

    async close(): Promise<void> {
        if (this.initialized) {
            try {
                await this.client.quit();
            } catch (error) {
                console.error('Error closing Redis connection:', error);
            } finally {
                this.initialized = false;
            }
        }
    }
}
