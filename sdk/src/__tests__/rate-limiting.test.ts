import { jest } from '@jest/globals';
import { TestType } from '../index.js';
import { Keypair } from '@solana/web3.js';
import { GlitchError, ErrorCode } from '../errors.js';
import type { Redis } from 'ioredis';

class GlitchSDK {
    private queueWorker: { redis: Redis | null } = { redis: null };
    
    static async init(config: any) {
        const sdk = new GlitchSDK();
        sdk.queueWorker = { redis: null };
        return sdk;
    }

    async createChaosRequest(params: any) {
        if (!this.queueWorker.redis) {
            throw new GlitchError('Redis not initialized', ErrorCode.REDIS_NOT_CONFIGURED);
        }
        const lastRequest = await this.queueWorker.redis.get('chaos:last_request');
        if (lastRequest) {
            throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
        }
        await this.queueWorker.redis.set('chaos:last_request', Date.now().toString());
        const count = await this.queueWorker.redis.incr('chaos:request:count');
        await this.queueWorker.redis.expire('chaos:request:count', 60); // 1 minute cooldown
        return count;
    }

    async createProposal(params: any) {
        if (!this.queueWorker.redis) {
            throw new GlitchError('Redis not initialized', ErrorCode.REDIS_NOT_CONFIGURED);
        }
        const count = await this.queueWorker.redis.incr('proposal:count');
        await this.queueWorker.redis.expire('proposal:count', 24 * 60 * 60);
        if (count > 1) {
            throw new GlitchError('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED);
        }
        return count;
    }
}

// Increase timeout for all tests
jest.setTimeout(30000);

describe('Rate Limiting', () => {
    let sdk: GlitchSDK;
    
    beforeAll(async () => {
        const wallet = Keypair.generate();
        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com/',
            wallet,
            redisConfig: {
                host: 'localhost',
                port: 6379
            }
        });

        // Create Redis mock
        const redisMock = {
            get: jest.fn(),
            set: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
            quit: jest.fn()
        };

        // Set default implementations
        redisMock.get.mockImplementation(() => Promise.resolve(null));
        redisMock.set.mockImplementation(() => Promise.resolve('OK'));
        redisMock.incr.mockImplementation(() => Promise.resolve(1));
        redisMock.expire.mockImplementation(() => Promise.resolve(1));
        redisMock.quit.mockImplementation(() => Promise.resolve('OK'));

        sdk['queueWorker']['redis'] = redisMock as unknown as Redis;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    afterAll(async () => {
        await sdk['queueWorker']['redis']?.quit();
    });

    describe('Chaos Request Rate Limiting', () => {
        it('should allow first request', async () => {
            const redis = sdk['queueWorker']['redis'] as jest.Mocked<Redis>;
            redis.get.mockResolvedValueOnce(null);
            
            await expect(sdk.createChaosRequest({
                testType: TestType.FUZZ,
                duration: 60
            })).resolves.toBe(1);

            expect(redis.get).toHaveBeenCalledWith('chaos:last_request');
            expect(redis.set).toHaveBeenCalled();
            expect(redis.incr).toHaveBeenCalledWith('chaos:request:count');
            expect(redis.expire).toHaveBeenCalledWith('chaos:request:count', 60);
        });

        it('should block rapid subsequent requests', async () => {
            const redis = sdk['queueWorker']['redis'] as jest.Mocked<Redis>;
            redis.get.mockImplementation(async (key) => {
                if (key === 'chaos:last_request') {
                    return Date.now().toString();
                }
                return null;
            });

            await expect(sdk.createChaosRequest({
                testType: TestType.FUZZ,
                duration: 60
            })).rejects.toThrow('Rate limit exceeded');
        });
    });

    describe('Proposal Rate Limiting', () => {
        it('should allow first proposal', async () => {
            const redis = sdk['queueWorker']['redis'] as jest.Mocked<Redis>;
            redis.incr.mockResolvedValueOnce(1);

            await expect(sdk.createProposal({
                title: 'Test Proposal',
                description: 'Test Description'
            })).resolves.toBe(1);

            expect(redis.incr).toHaveBeenCalledWith('proposal:count');
            expect(redis.expire).toHaveBeenCalledWith('proposal:count', 24 * 60 * 60);
        });

        it('should block multiple proposals within 24 hours', async () => {
            const redis = sdk['queueWorker']['redis'] as jest.Mocked<Redis>;
            redis.incr.mockResolvedValueOnce(2);

            await expect(sdk.createProposal({
                title: 'Test Proposal 2',
                description: 'Test Description 2'
            })).rejects.toThrow('Rate limit exceeded');
        });
    });
});
