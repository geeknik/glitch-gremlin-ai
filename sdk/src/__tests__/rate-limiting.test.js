import { GlitchSDK } from '../index';
import { Keypair } from '@solana/web3.js';
import { jest } from '@jest/globals';

describe('Rate Limiting', () => {
    let sdk;
    let mockRedis;
    
    beforeEach(async () => {
        // Mock Redis client functions
        mockRedis = {
            incr: jest.fn(),
            expire: jest.fn(),
            get: jest.fn(),
            del: jest.fn()
        };

        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });

        // Inject mock Redis client
        sdk.queueWorker = {
            redis: mockRedis
        };
    });

    afterEach(async () => {
        jest.clearAllMocks();
        // Clean up any remaining mock timers
        if (jest.getTimerCount()) {
            jest.runOnlyPendingTimers();
            jest.useRealTimers();
        }
    });

    describe('Request Rate Limits', () => {
        it('should enforce cooldown between requests', async () => {
            // Setup mock to simulate first request allowed
            mockRedis.get.mockResolvedValueOnce(null);
            mockRedis.incr.mockResolvedValueOnce(1);
            
            // First request should succeed
            await expect(sdk.createChaosRequest({ 
                testType: 'FUZZ',
                duration: 60 
            })).resolves.toBeDefined();

            // Setup mock to simulate request within cooldown
            mockRedis.get.mockResolvedValueOnce(Date.now().toString());
            
            // Second request should fail due to cooldown
            await expect(sdk.createChaosRequest({
                testType: 'FUZZ', 
                duration: 60
            })).rejects.toThrow('Rate limit exceeded');
        });

        it('should properly handle multiple rate limit attempts', async () => {
            // Setup mock for multiple requests
            mockRedis.get.mockResolvedValue(null);
            let requestCount = 0;
            mockRedis.incr.mockImplementation(() => {
                requestCount++;
                return Promise.resolve(requestCount);
            });

            const makeRequest = () => sdk.createChaosRequest({
                testType: 'FUZZ',
                duration: 60
            });

            // Execute multiple requests in parallel
            const requests = Array(5).fill().map(makeRequest);
            
            // Some should succeed, some should fail due to rate limit
            await Promise.allSettled(requests);
            
            expect(mockRedis.incr).toHaveBeenCalled();
            expect(mockRedis.expire).toHaveBeenCalled();
        });

        describe('governance rate limiting', () => {
            it('should limit proposals per day', async () => {
                // Mock Redis for governance rate limiting
                mockRedis.get.mockResolvedValue(null);
                mockRedis.incr.mockResolvedValueOnce(5); // Over daily limit
                
                // Attempt to create proposal
                await expect(sdk.createProposal({
                    title: 'Test Proposal',
                    description: 'Test Description'
                })).rejects.toThrow('Rate limit exceeded');
                
                expect(mockRedis.incr).toHaveBeenCalled();
                expect(mockRedis.expire).toHaveBeenCalled();
            });
        });
    });
});
