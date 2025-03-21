import { GlitchSDK, TestType } from '../index';
import { Keypair, PublicKey } from '@solana/web3.js';
import IoRedisMock from '../__mocks__/ioredis';
import { jest } from '@jest/globals';
describe('Governance', () => {
    let sdk;
    let redisMock;

    beforeEach(async () => {
        const wallet = Keypair.generate();
        redisMock = new IoRedisMock();
        
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet,
            redis: redisMock
        });
        
        // Set up Redis mock methods
        redisMock.incr = jest.fn().mockResolvedValue(1);
        redisMock.expire = jest.fn().mockResolvedValue('OK');
        redisMock.get = jest.fn().mockResolvedValue(null);
        redisMock.set = jest.fn().mockResolvedValue('OK');
        // Mock Solana RPC calls
        jest.spyOn(sdk['connection'], 'getBalance')
            .mockResolvedValue(1_000_000_000); // 1 SOL
        jest.spyOn(sdk['connection'], 'simulateTransaction')
            .mockResolvedValue({
            context: { slot: 0 },
            value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
        });
        jest.spyOn(sdk['connection'], 'sendTransaction')
            .mockResolvedValue('mock-tx-signature');
    });
    afterEach(async () => {
        if (sdk) {
            if (sdk['queueWorker'] && sdk['queueWorker'].redis) {
                await sdk['queueWorker'].redis.flushall();
                await sdk['queueWorker'].redis.quit();
            }
            await sdk['connection'].getRecentBlockhash();
        }
        if (redisMock) {
            jest.clearAllMocks();
            await redisMock.flushall();
            await redisMock.quit();
        }
        jest.clearAllTimers();
        jest.clearAllMocks();
    });
    afterAll(async () => {
        // No need to explicitly close Connection
        jest.clearAllMocks();
    });
    describe('proposal creation', () => {
        beforeEach(() => {
            // Mock getBalance to return sufficient funds
            jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValue(10000);
        });
        it('should validate minimum stake requirements', async () => {
            // Mock Redis rate limit check
            redisMock.get.mockResolvedValueOnce(null);
            redisMock.incr.mockResolvedValueOnce(1);
            
            // Mock low balance for this test
            jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValueOnce(50); // Not enough SOL
                
            await expect(sdk.createProposal({
                title: "Test Proposal",
                description: "Test Description",
                targetProgram: "11111111111111111111111111111111",
                testParams: {
                    testType: TestType.FUZZ,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                },
                stakingAmount: 10 // Too low stake amount
            })).rejects.toThrow('Insufficient stake amount');
        });
        it('should enforce proposal rate limits', async () => {
            const validProposal = {
                title: "Test Proposal",
                description: "Test Description",
                targetProgram: "11111111111111111111111111111111",
                testParams: {
                    testType: TestType.FUZZ,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                },
                stakingAmount: 1000
            };
            // First proposal should succeed
            await sdk.createProposal(validProposal);

            // Mock Redis to simulate rate limit
            redisMock.get.mockResolvedValueOnce(Date.now().toString());
            redisMock.incr.mockResolvedValueOnce(5); // Over the limit

            // Second proposal should fail due to rate limit
            await expect(sdk.createProposal(validProposal))
                .rejects.toThrow('Rate limit exceeded');
                
            // Keep rate limit active
            redisMock.get.mockResolvedValueOnce(Date.now().toString());
            redisMock.incr.mockResolvedValueOnce(6);
            // Third proposal should also fail
            await expect(sdk.createProposal(validProposal))
                .rejects.toThrow('Rate limit exceeded');
        });
    });
    describe('voting', () => {
        it('should require minimum token balance to vote', async () => {
            // Mock Redis rate limit check
            redisMock.get.mockResolvedValueOnce(null);
            redisMock.incr.mockResolvedValueOnce(1);
            
            // Mock low balance for this test
            jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValueOnce(100); // Not enough for voting
            // Mock transaction simulation to succeed
            jest.spyOn(sdk['connection'], 'simulateTransaction')
                .mockResolvedValueOnce({
                context: { slot: 0 },
                value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
            });
            await expect(sdk.vote('test-proposal-id', true))
                .rejects.toThrow('Insufficient token balance to vote');
        });
        it('should prevent double voting', async () => {
            // Mock all required connection methods
            const mockGetBalance = jest.spyOn(sdk['connection'], 'getBalance')
                .mockResolvedValue(2000);
            const mockSimulateTransaction = jest.spyOn(sdk['connection'], 'simulateTransaction')
                .mockResolvedValue({
                context: { slot: 0 },
                value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
            });
            const mockSendTransaction = jest.spyOn(sdk['connection'], 'sendTransaction')
                .mockImplementation(async () => {
                return 'mock-signature';
            });
            // First vote should succeed
            await sdk.vote('test-proposal-id', true);
            // Mock hasVotedOnProposal to return true for second vote
            jest.spyOn(sdk, 'hasVotedOnProposal')
                .mockResolvedValueOnce(true);
            // Second vote should fail
            await expect(sdk.vote('test-proposal-id', false))
                .rejects.toThrow('Already voted on this proposal');
            // Restore all mocks
            mockGetBalance.mockRestore();
            mockSimulateTransaction.mockRestore();
            mockSendTransaction.mockRestore();
            jest.restoreAllMocks();
        });
    });
    describe('proposal execution', () => {
        it('should only execute passed proposals', async () => {
            // Mock Redis operations
            redisMock.get.mockResolvedValueOnce(null);
            redisMock.incr.mockResolvedValueOnce(1);
            
            const mockGetAccountInfo = jest.spyOn(sdk['connection'], 'getAccountInfo')
                .mockResolvedValueOnce({
                data: Buffer.from('{"status":"failed"}'),
                executable: false,
                lamports: 0,
                owner: sdk['programId'],
                rentEpoch: 0
            });
            await expect(sdk.executeProposal('proposal-1234'))
                .rejects.toThrow('Proposal not passed');
        });
        it('should enforce timelock period', async () => {
            // Mock current time
            const now = 1641024000000; // Fixed timestamp
            jest.spyOn(Date, 'now').mockImplementation(() => now);
            const mockGetAccountInfo = jest.spyOn(sdk['connection'], 'getAccountInfo')
                .mockResolvedValueOnce({
                data: Buffer.from(JSON.stringify({
                    status: 'active',
                    endTime: now + 86400000, // Set endTime in the future
                    executionTime: now + 172800000, // Set execution time even further
                    voteWeights: {
                        yes: 100,
                        no: 50,
                        abstain: 0
                    },
                    quorum: 100
                })),
                executable: false,
                lamports: 0,
                owner: sdk['programId'],
                rentEpoch: 0
            });
            const mockGetProposalStatus = jest.spyOn(sdk, 'getProposalStatus')
                .mockResolvedValueOnce({
                id: 'proposal-5678',
                status: 'active',
                votesFor: 100,
                votesAgainst: 50,
                endTime: Date.now() + 86400000
            });
            // Create valid base58 proposal ID
            const proposalId = new PublicKey(Keypair.generate().publicKey).toString();
            await expect(sdk.executeProposal(proposalId))
                .rejects.toThrow('Timelock period not elapsed');
            mockGetProposalStatus.mockRestore();
        });
        it('should check quorum requirements', async () => {
            const mockGetAccountInfo = jest.spyOn(sdk['connection'], 'getAccountInfo')
                .mockResolvedValueOnce({
                data: Buffer.from(JSON.stringify({
                    status: 'active',
                    voteWeights: {
                        yes: 100,
                        no: 50,
                        abstain: 0
                    },
                    quorum: 1000,
                    endTime: Date.now() + 86400000,
                    executed: false
                })),
                executable: false,
                lamports: 0,
                owner: sdk['programId'],
                rentEpoch: 0
            });
            const mockGetProposalStatus = jest.spyOn(sdk, 'getProposalStatus')
                .mockResolvedValueOnce({
                id: 'proposal-9012',
                status: 'active',
                votesFor: 100,
                votesAgainst: 50,
                endTime: Date.now() - 86400000
            });
            // Create valid base58 proposal ID
            const proposalId = new PublicKey(Keypair.generate().publicKey).toString();
            await expect(sdk.executeProposal(proposalId))
                .rejects.toThrow('Proposal has not reached quorum');
            mockGetProposalStatus.mockRestore();
        });
    });
});
