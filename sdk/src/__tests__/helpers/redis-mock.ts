import Redis from 'ioredis-mock';
import type { Redis as RedisType } from 'ioredis';
import { jest } from '@jest/globals';

// In-memory storage for Redis mock
const mockStorage: Record<string, string> = {
    'test:stakes': '{}',
    'test:rewards': '{}'
};

const mockRedisOptions = {
    enableOfflineQueue: true,
    lazyConnect: false
};

export const createMockRedis = (): RedisType => {
    if (!(global as any).mockRedis) {
        const RedisMock = Redis as any;
        (global as any).mockRedis = new RedisMock(mockRedisOptions);
        
        // Ensure the mock is connected
        (global as any).mockRedis.status = 'ready';
        
        // Override methods with custom implementations
        (global as any).mockRedis.set = jest.fn(async (key: string, value: string) => {
            mockStorage[key] = value;
            return 'OK';
        });
        
        (global as any).mockRedis.get = jest.fn(async (key: string) => {
            return mockStorage[key] || null;
        });
        
        (global as any).mockRedis.flushall = jest.fn(async () => {
            Object.keys(mockStorage).forEach(key => {
                mockStorage[key] = '{}';
            });
            return 'OK';
        });
        
        (global as any).mockRedis.disconnect = jest.fn(async () => undefined);
        
        // Add additional methods as needed
        (global as any).mockRedis.hset = jest.fn(async (key: string, field: string, value: string) => {
            const data = JSON.parse(mockStorage[key] || '{}');
            data[field] = value;
            mockStorage[key] = JSON.stringify(data);
            return 1;
        });
        
        (global as any).mockRedis.hget = jest.fn(async (key: string, field: string) => {
            const data = JSON.parse(mockStorage[key] || '{}');
            return data[field] || null;
        });
    }
    return (global as any).mockRedis;
};

export type MockRedis = ReturnType<typeof createMockRedis>;

// Add mock implementation for common Redis methods
export const mockRedisImplementation = {
    get: jest.fn(async (key: string) => mockStorage[key] || null),
    set: jest.fn(async (key: string, value: string) => {
        mockStorage[key] = value;
        return 'OK' as const;
    }),
    del: jest.fn(async (key: string) => {
        if (mockStorage[key]) {
            delete mockStorage[key];
            return 1;
        }
        return 0;
    }),
    incr: jest.fn(async (key: string) => {
        const value = parseInt(mockStorage[key] || '0', 10);
        mockStorage[key] = (value + 1).toString();
        return value + 1;
    }),
    expire: jest.fn(async () => 1),
    quit: jest.fn(async () => 'OK' as const),
    connect: jest.fn(async () => undefined),
    flushall: jest.fn(async () => {
        Object.keys(mockStorage).forEach(key => {
            mockStorage[key] = '{}';
        });
        return 'OK' as const;
    }),
    disconnect: jest.fn(async () => undefined)
}; 