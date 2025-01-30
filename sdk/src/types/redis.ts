import type { Redis as IORedis, RedisOptions } from 'ioredis';

export interface RedisConfig extends RedisOptions {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    retryStrategy?: (times: number) => number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
    commandTimeout?: number;
    keepAlive?: number;
    connectTimeout?: number;
}

export type Redis = IORedis;

export interface RedisQueueConfig {
    queueName: string;
    maxItems?: number;
    processingTimeout?: number;
    retryDelay?: number;
}

export interface QueueItem<T> {
    id: string;
    data: T;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: number;
    updatedAt: number;
    error?: string;
} 
