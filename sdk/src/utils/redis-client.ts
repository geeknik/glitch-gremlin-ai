import type { Redis as RedisClient } from 'ioredis';
import type { RedisConfig } from '../types.js';

export async function createRedisClient(config: RedisConfig): Promise<RedisClient> {
    const { default: Redis } = await import('ioredis');
    // @ts-ignore - Ignore the constructor type error as we know it works at runtime
    return new Redis(config);
}

export async function createRedisMockClient(config: RedisConfig): Promise<RedisClient> {
    const { IoRedisMock } = await import('../__mocks__/ioredis.js');
    return new IoRedisMock(config) as unknown as RedisClient;
} 