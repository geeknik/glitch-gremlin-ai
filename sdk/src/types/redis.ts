import type { Redis as IORedis, RedisOptions } from 'ioredis';

export function parseRedisInfo(response: string): Record<string, string> {
    const result: Record<string, string> = {};
    response.split('\r\n').forEach(line => {
        if (line.startsWith('#') || line.trim() === '') return; // Skip section headers and empty lines
        const [key, ...values] = line.split(':');
        if (key && values.length) {
            result[key.trim()] = values.join(':').trim();
        }
    });
    return result;
}

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
    infoRaw(section?: string): Promise<string>;
    info(section?: string): Promise<Record<string, string>>;
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
