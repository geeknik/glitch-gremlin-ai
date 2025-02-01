import type { Redis as IORedis, RedisOptions } from 'ioredis';

export interface RedisError extends Error {
    code?: string;
    command?: string;
    args?: any[];
    response?: any;
}

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

export interface Redis extends IORedis {
    info(section?: string): Promise<string>;
    get(key: string): Promise<string | null>;
    hgetall(key: string): Promise<{[key: string]: string} | null>;
}

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
