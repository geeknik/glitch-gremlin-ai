import Redis from 'ioredis-mock';
import type { Redis as RedisType } from 'ioredis';

const mockRedisOptions = {
    enableOfflineQueue: true,
    lazyConnect: true
};

export const createMockRedis = (): RedisType => {
    if (!(global as any).mockRedis) {
        const RedisMock = Redis as any;
        (global as any).mockRedis = new RedisMock(mockRedisOptions);
    }
    return (global as any).mockRedis;
};

export type MockRedis = ReturnType<typeof createMockRedis>;

// Add mock implementation for common Redis methods
export const mockRedisImplementation = {
    get: jest.fn().mockImplementation((key: string) => Promise.resolve(null)),
    set: jest.fn().mockImplementation((key: string, value: string) => Promise.resolve('OK')),
    del: jest.fn().mockImplementation((key: string) => Promise.resolve(1)),
    incr: jest.fn().mockImplementation((key: string) => Promise.resolve(1)),
    expire: jest.fn().mockImplementation((key: string, seconds: number) => Promise.resolve(1)),
    quit: jest.fn().mockResolvedValue('OK'),
    connect: jest.fn().mockResolvedValue(undefined)
}; 