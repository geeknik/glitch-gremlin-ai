import { Redis as IORedis } from 'ioredis';

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    retryStrategy?: (times: number) => number | null;
}

export type Redis = IORedis; 