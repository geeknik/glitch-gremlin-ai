import { jest } from '@jest/globals';
import { GlitchSDK, TestType, ProposalState } from '../index.js';
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { ErrorCode, GlitchError } from '../errors';
import Redis from 'ioredis-mock';

// Mock type definitions
type SolanaJestMock = jest.Mock & {
    mockResolvedValue: (value: any) => SolanaJestMock;
    mockResolvedValueOnce: (value: any) => SolanaJestMock; 
};

interface IMockConnection {
    getAccountInfo: SolanaJestMock;
    getBalance: SolanaJestMock;
    getRecentBlockhash: SolanaJestMock;
    sendTransaction: SolanaJestMock;
    confirmTransaction: SolanaJestMock;
    simulateTransaction: SolanaJestMock;
    getVersion: SolanaJestMock;
    getParsedTokenAccountsByOwner: SolanaJestMock;
}

class MockConnection implements IMockConnection {
    // Create jest.fn() with proper typing that includes all mock methods
    getBalance = jest.fn().mockImplementation(() => Promise.resolve(2000)); // Default above minimum required
    getRecentBlockhash = jest.fn().mockImplementation(() => Promise.resolve({
        blockhash: '1111111111111111111111111111',
        lastValidBlockHeight: 9999999
    }));
    sendTransaction: MockMethod<string> = jest.fn().mockImplementation(() => Promise.resolve('mock-signature'));
    confirmTransaction: MockMethod<{value: {err: null | Error}}> = jest.fn().mockImplementation(() => Promise.resolve({ value: { err: null } }));
    simulateTransaction: MockMethod<RpcResponseAndContext<SimulatedTransactionResponse>> = jest.fn().mockImplementation(() => Promise.resolve({
        value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
    }));
    getVersion: MockMethod<{[key: string]: string}> = jest.fn().mockImplementation(() => Promise.resolve({ 'solana-core': '1.0.0' }));
    getParsedTokenAccountsByOwner: MockMethod<GetProgramAccountsResponse> = jest.fn().mockImplementation(() => Promise.resolve({ value: [] }));

    clearMocks(): void {
        [
            this.getAccountInfo,
            this.getBalance,
            this.getRecentBlockhash,
            this.sendTransaction,
            this.confirmTransaction,
            this.simulateTransaction,
            this.getVersion,
            this.getParsedTokenAccountsByOwner
        ].forEach((mock) => {
            mock.mockClear();
            mock.mockReset();
            // Re-initialize default mock implementations
            mock.mockImplementation(() => Promise.resolve(null));
        });
        
        // Reset default responses
        this.getAccountInfo.mockResolvedValue(null);
        this.getBalance.mockResolvedValue(2000); // Reset to default above minimum
        this.getRecentBlockhash.mockResolvedValue({
            blockhash: '1111111111111111111111111111',
            lastValidBlockHeight: 9999999
        });
        this.sendTransaction.mockResolvedValue('mock-signature');
        this.confirmTransaction.mockResolvedValue({ value: { err: null } });
        this.simulateTransaction.mockResolvedValue({
            value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
        });
        this.getVersion.mockResolvedValue({ 'solana-core': '1.0.0' });
        this.getParsedTokenAccountsByOwner.mockResolvedValue({ value: [] });
    }
}

// Initialize shared test state
let sdk: GlitchSDK;
let mockConnection: MockConnection;
let redis: Redis;
type RedisMethod = jest.Mock<Promise<any>>;
let mockMethods: Record<string, RedisMethod>;

// Setup before all tests
beforeAll(async () => {
    // Initialize Redis mock with proper configuration
    const redisMock = new Redis({
        data: {
            'requests:governance': '0',
            'requests:default': '0'
        },
        enableOfflineQueue: true,
        lazyConnect: false,
        keyPrefix: '',
        autoResendUnfulfilledCommands: true,
        maxRetriesPerRequest: 20,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        enableReadyCheck: true,
        enableAutoPipelining: true
    });
    
    // Ensure Redis is ready
    await new Promise<void>((resolve) => {
        redisMock.status = 'ready';
        redisMock.connected = true;
        resolve();
    });

    // Define mock methods with proper typing
    type RedisMethod = jest.Mock<Promise<any>>;

    // Initialize mockMethods with mock implementations
    mockMethods = {
        get: jest.fn().mockImplementation(async (key: string) => {
            if (key === 'requests:governance') return '0';
            return null;
        }),

        set: jest.fn().mockImplementation(async (key: string, value: string) => {
            redisMock.data[key] = value;
            return 'OK';
        }),

        incr: jest.fn().mockImplementation(async (key: string) => {
            const val = redisMock.data[key] || '0';
            const newVal = (parseInt(val) + 1).toString();
            redisMock.data[key] = newVal;
            return parseInt(newVal);
        }),

        expire: jest.fn().mockResolvedValue(1),
        flushall: jest.fn().mockResolvedValue('OK'),
        hget: jest.fn().mockResolvedValue(null),
        hset: jest.fn().mockResolvedValue('OK'),
        exists: jest.fn().mockResolvedValue(0),
        del: jest.fn().mockResolvedValue(1),
        quit: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn().mockResolvedValue(undefined),

        connect: jest.fn().mockImplementation(async () => {
            redisMock.status = 'ready';
            redisMock.connected = true;
            return Promise.resolve();
        })
    };

    // Assign mock methods to Redis instance
    Object.assign(redisMock, mockMethods);

    // Set connection state
    redisMock.status = 'ready';
    redisMock.connected = true;

    redis = redisMock;

    // Set up global Redis instance
    global.__REDIS__ = redis;
        // Initialize Redis connection
        await redis.connect();
    // Use fake timers
    jest.useFakeTimers();
});

// Setup before each test
beforeEach(async () => {
    // Reset all mocks and timers
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Reset Redis state
    if (global.__REDIS__) {
        await global.__REDIS__.flushall();
        await global.__REDIS__.set("requests:governance", "0");
        await global.__REDIS__.set("requests:default", "0");
    }

    // Initialize mock connection with default successful responses
    mockConnection = new MockConnection();
    
    // Mock successful transaction simulation
    mockConnection.simulateTransaction.mockResolvedValue({
        context: { slot: 0 },
        value: { 
            err: null,
            logs: ['Program log: Success'],
            accounts: null,
            unitsConsumed: 0,
            returnData: null
        }
    });
    
    // Mock successful transaction execution
    mockConnection.sendTransaction.mockResolvedValue('mock-signature');
    mockConnection.confirmTransaction.mockResolvedValue({ 
        value: { 
            err: null,
            confirmations: 1,
            confirmationStatus: 'confirmed',
            slot: 0
        }
    });

    // Mock sufficient balance for all tests
    mockConnection.getBalance.mockResolvedValue(2000000);
    
    // Mock proposal account data
    mockConnection.getAccountInfo.mockImplementation(() => {
        const buffer = Buffer.alloc(392);
        const mockData = {
            status: 'active',
            voteWeights: { yes: 150, no: 50, abstain: 0 },
            quorum: 100,
            executed: false
        };
        Buffer.from(JSON.stringify(mockData)).copy(buffer);
        return Promise.resolve({
            data: buffer,
            executable: false,
            lamports: 1000000,
            owner: new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
            rentEpoch: 0
        });
    });
        
    const wallet = Keypair.generate();
        
    // Ensure Redis is connected
    if (!redis.connected) {
        await redis.connect();
    }
        
    sdk = await GlitchSDK.create({
        cluster: 'https://api.devnet.solana.com',
        wallet,
        heliusApiKey: 'test-api-key',
        redis,
        connection: mockConnection as unknown as Connection
    });

    await redis.flushall();
    await redis.set("requests:default", "0");
    await redis.set("requests:governance", "0");
        
    // Reset mock implementations
    mockConnection.simulateTransaction.mockImplementation(async (tx) => ({
        context: { slot: 0 },
        value: { 
            err: null,
            logs: ['Program execution succeeded'],
            accounts: null,
            unitsConsumed: 0,
            returnData: null
        }
    }));
        
    mockConnection.sendTransaction.mockImplementation(async () => 'mock-signature');
});

describe('Governance', () => {
    afterEach(async () => {
        // Reset all mocks and restore original implementations
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.restoreAllMocks();
        
        // Reset Redis state
        if (global.__REDIS__?.flushall) {
            await global.__REDIS__.flushall();
            await global.__REDIS__.set("requests:default", "0");
            await global.__REDIS__.set("requests:governance", "0");
        }
        
        // Reset mock connection state
        mockConnection.clearMocks();
        
        // Restore real timers
        jest.useRealTimers();
    });
    
    describe('proposal creation', () => {
        it('should validate minimum stake requirements', async () => {
            // Mock low balance for this test
            mockConnection.getBalance.mockResolvedValueOnce(50); // Not enough SOL

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
            })).rejects.toMatchObject({
                message: 'Insufficient stake amount',
                code: ErrorCode.INSUFFICIENT_FUNDS
            });
        });
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

            // Reset rate limit counter
            await global.__REDIS__.set('requests:governance', '0');
            
            // First proposal should succeed
            await expect(sdk.createProposal(validProposal)).resolves.not.toThrow();
            
            // Wait for a small delay
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Second proposal should fail due to rate limit
            await expect(sdk.createProposal(validProposal))
                .rejects
                .toThrow('Rate limit exceeded');

            // Verify rate limit counter
            const finalRateCount = await global.__REDIS__.get("requests:governance");
            expect(parseInt(finalRateCount)).toBe(1);
        });
    });

    describe('voting', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });
        it('should require minimum token balance to vote', async () => {
            // Temporarily override balance for this test
            const originalGetBalance = mockConnection.getBalance;
            mockConnection.getBalance = jest.fn().mockResolvedValue(100); // Set very low balance

            // Mock transaction simulation to succeed
            mockConnection.simulateTransaction.mockResolvedValueOnce({
                context: { slot: 0 },
                value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
            });

            await expect(sdk.vote('test-proposal-id', true))
                .rejects.toThrow('Insufficient token balance to vote');
                
            // Restore original mock
            mockConnection.getBalance = originalGetBalance;
        });

        it('should prevent double voting', async () => {
            // Create a test proposal first
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

            // Ensure sufficient balance for voting
            mockConnection.getBalance.mockResolvedValue(2000000);
            
            // Create proposal and get its ID
            const proposal = await sdk.createProposal(validProposal);
            
            // Mock transaction simulation success
            mockConnection.simulateTransaction.mockResolvedValue({
                context: { slot: 0 },
                value: { 
                    err: null,
                    logs: ['Program log: Vote recorded successfully'],
                    accounts: null,
                    unitsConsumed: 0,
                    returnData: null
                }
            });
            
            // Mock transaction success
            mockConnection.sendTransaction.mockResolvedValue('mock-signature');
            mockConnection.confirmTransaction.mockResolvedValue({ 
                value: { 
                    err: null,
                    confirmations: 1,
                    confirmationStatus: 'finalized'
                }
            });
            
            // First vote should succeed
            await expect(sdk.vote(proposal.id, true)).resolves.not.toThrow();
            
            // Second vote should fail
            await expect(sdk.vote(proposal.id, true))
                .rejects
                .toThrow('Already voted on this proposal');
                
            // Cleanup
            jest.restoreAllMocks();

            // Restore mock implementations
            mockConnection.getBalance.mockRestore();
            mockConnection.simulateTransaction.mockRestore();
            mockConnection.sendTransaction.mockRestore();
            jest.restoreAllMocks();
        });
    });

    describe('proposal execution', () => {
        it('should validate proposal status', async () => {
            mockConnection.getAccountInfo.mockImplementationOnce(() => {
                const mockData = {
                    status: 'active',
                    state: ProposalState.Defeated,
                    proposer: sdk['wallet'].publicKey.toString(),
                    executed: false,
                    voteWeights: { yes: 0, no: 100, abstain: 0 },
                    quorum: 100,
                    timeLockEnd: Date.now() - 1000, // Ensure timelock has passed  
                    startTime: Date.now() - 172800000,
                    endTime: Date.now() - 86400000, // Ensure voting period has ended
                    votes: {
                        yes: 0,
                        no: 100,
                        abstain: 0
                    }
                }
                const buffer = Buffer.alloc(392);
                Buffer.from(JSON.stringify(mockData)).copy(buffer);
                return Promise.resolve({
                    data: buffer,
                    executable: false,
                    lamports: 0,
                    owner: sdk['programId'],
                    rentEpoch: 0
                });
            });

            // Mock getProposalStatus to return consistent state
            jest.spyOn(sdk, 'getProposalStatus').mockResolvedValueOnce({
                status: 'failed',
                state: 'Defeated',
                executed: false,
                voteWeights: { yes: 0, no: 100, abstain: 0 },
                quorum: 100
            });

            await expect(sdk.executeProposal(new PublicKey(Keypair.generate().publicKey).toString()))
                .rejects.toThrow('Proposal is not active');
        });

        it('should enforce timelock period', async () => {
            // Mock current time
            const now = 1641024000000; // Fixed timestamp
            jest.spyOn(Date, 'now').mockImplementation(() => now);

            // Mock the account info to return valid proposal data
            mockConnection.getAccountInfo.mockImplementationOnce(() => {
                const buffer = Buffer.alloc(392);
                const mockData = {
                    status: 'succeeded',
                    state: 'Succeeded', 
                    endTime: now - 86400000, // Voting ended
                    executionTime: now + 172800000,
                    timeLockEnd: now + 86400000, // Timelock not elapsed
                    voteWeights: {
                        yes: 200,
                        no: 50,
                        abstain: 0,
                    },
                    quorum: 100,
                    executed: false
                };
                Buffer.from(JSON.stringify(mockData)).copy(buffer);
                return Promise.resolve({
                    data: buffer,
                    executable: false,
                    lamports: 1000000,
                    owner: sdk['programId'],
                    rentEpoch: 0
                });
            });

            const mockGetProposalStatus = jest.spyOn(sdk, 'getProposalStatus')
                .mockResolvedValueOnce({
                    id: 'proposal-5678', 
                    status: 'succeeded',
                    title: "Test Proposal",
                    description: "Test Description",
                    proposer: sdk['wallet'].publicKey.toString(),
                    startTime: Date.now() - 86400000,
                    endTime: Date.now() + 86400000,
                    votes: {
                        yes: 200,
                        no: 50,
                        abstain: 0
                    },
                    quorum: 100,
                    stakedAmount: 1000,
                    testParams: {
                        targetProgram: "11111111111111111111111111111111",
                        testType: TestType.FUZZ,
                        duration: 300,
                        intensity: 5
                    },
                    state: {
                        isActive: true,
                        isPassed: false,
                        isExecuted: false,
                        isExpired: false,
                        canExecute: false,
                        canVote: true,
                        timeRemaining: 86400000
                    }
                });

            // Create valid base58 proposal ID
            const proposalId = new PublicKey(Keypair.generate().publicKey);
            

            await expect(sdk.executeProposal(proposalId.toString()))
                .rejects.toThrow('Proposal not found');
                
            mockGetProposalStatus.mockRestore();
        });

        it('should check quorum requirements', async () => {
            // Create a buffer of sufficient size (>= 392 bytes) with proper proposal state
            const proposalState = {
                status: 'active',
                voteWeights: {
                    yes: 400,
                    no: 50,
                    abstain: 0
                },
                quorum: 1000,
                endTime: Date.now() + 86400000,
                executed: false,
                proposer: sdk['wallet'].publicKey.toString(),
                title: "Test Proposal".padEnd(64, ' '),  // Pad strings to ensure sufficient buffer size
                description: "Test Description".padEnd(256, ' '),
                testParams: {
                    testType: 1,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                }
            };

            // Convert to buffer and pad to required size
            const stateBuffer = Buffer.alloc(400);  // Allocate more than minimum required
            Buffer.from(JSON.stringify(proposalState)).copy(stateBuffer);

            mockConnection.getAccountInfo.mockImplementation(() => {
                return Promise.resolve({
                    data: stateBuffer,
                    executable: false,
                    lamports: 0,
                    owner: sdk['programId'],
                    rentEpoch: 0
                });
            });

            const mockGetProposalStatus = jest.spyOn(sdk, 'getProposalStatus')
                .mockResolvedValueOnce({
                    id: 'proposal-9012',
                    status: 'succeeded',
                    title: "Test Proposal",
                    description: "Test Description",
                    proposer: "test-proposer",
                    votes: {
                        yes: 100,
                        no: 50,
                        abstain: 0
                    },
                    startTime: Date.now() - 86400000,
                    endTime: Date.now() - 86400000,
                    quorum: 100,
                    stakedAmount: 1000,
                    testParams: {
                        targetProgram: "11111111111111111111111111111111",
                        testType: TestType.FUZZ,
                        duration: 300,
                        intensity: 5
                    },
                    state: {
                        isActive: false,
                        isPassed: false,
                        isExecuted: false,
                        isExpired: true,
                        canExecute: false,
                        canVote: false,
                        timeRemaining: 0
                    }
                });

            const proposalId = new PublicKey(Keypair.generate().publicKey).toString();
            
            await expect(sdk.executeProposal(proposalId))
                .rejects.toThrow('Proposal is not active');
                
            mockGetProposalStatus.mockRestore();
        });
    }); // end of proposal execution
});
