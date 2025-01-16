import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    AccountInfo,
    GetProgramAccountsResponse,
    SimulatedTransactionResponse,
    RpcResponseAndContext,
    SendOptions,
    Message,
    Signer,
    VersionedTransaction
} from '@solana/web3.js';
import { ProposalState } from '../types';
import { GovernanceManager } from '../governance';

// Mock types
type MockMethod<T = any> = jest.Mock<Promise<T>>;

interface IMockConnection {
    getAccountInfo: MockMethod<AccountInfo<Buffer> | null>;
    getBalance: MockMethod<number>;
    getRecentBlockhash: MockMethod<{blockhash: string; lastValidBlockHeight: number}>;
    sendTransaction: MockMethod<string>;
    confirmTransaction: MockMethod<{value: {err: null | Error}}>;
    simulateTransaction: MockMethod<RpcResponseAndContext<SimulatedTransactionResponse>>;
    getVersion: MockMethod<{[key: string]: string}>;
    getProgramAccounts: MockMethod<GetProgramAccountsResponse>;
}

// Mock Connection class
class MockConnection implements IMockConnection {
    getAccountInfo: MockMethod<AccountInfo<Buffer> | null> = jest.fn();
    getBalance: MockMethod<number> = jest.fn();
    getRecentBlockhash: MockMethod<{blockhash: string; lastValidBlockHeight: number}> = jest.fn();
    sendTransaction: MockMethod<string> = jest.fn();
    confirmTransaction: MockMethod<{value: {err: null | Error}}> = jest.fn();
    simulateTransaction: MockMethod<RpcResponseAndContext<SimulatedTransactionResponse>> = jest.fn();
    getVersion: MockMethod<{[key: string]: string}> = jest.fn();
    getProgramAccounts: MockMethod<GetProgramAccountsResponse> = jest.fn();

    constructor() {
        this.initialize();
    }

    initialize() {
        // Setup mock methods with proper implementation
        this.getAccountInfo = jest.fn().mockImplementation(() => {
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
        this.getBalance = jest.fn().mockResolvedValue(1000000);
        this.getRecentBlockhash = jest.fn().mockResolvedValue({
            blockhash: '1111111111111111111111111111',
            lastValidBlockHeight: 9999999
        });
        this.sendTransaction = jest.fn().mockImplementation(async (tx) => {
            return 'mock-signature';
        });
        this.confirmTransaction = jest.fn().mockResolvedValue({ value: { err: null } });
        this.simulateTransaction = jest.fn().mockImplementation(async () => ({
            value: { err: null, logs: ['Program execution succeeded'], accounts: null, unitsConsumed: 0, returnData: null }
        }));
        this.getVersion = jest.fn().mockResolvedValue({ 'solana-core': '1.0.0' });
        this.getProgramAccounts = jest.fn().mockResolvedValue([]);
    }
}

// Mock types for testing
interface VoteWeights {
    yes: number;
    no: number;
    abstain: number;
}

interface Vote {
    voter: PublicKey;
    vote: boolean;
    votingPower: number;
    timestamp: number;
}

interface ProposalData {
    state: ProposalState;
    executed: boolean;
    title: string;
    description: string;
    proposer: PublicKey;
    startTime: number;
    endTime: number;
    timeLockEnd: number;
    voteWeights: VoteWeights;
    votes: Vote[];
    yesVotes: number;
    noVotes: number;
    quorumRequired: number;
    executionTime: number;
    quorum: number;
    status: string;
}

// Helper functions for creating mock data
function createMockProposalData(overrides: Partial<ProposalData> = {}): ProposalData {
    const now = Date.now();
    return {
        state: ProposalState.Active,
        executed: false,
        title: "Test Proposal",
        description: "Test Description",
        proposer: new PublicKey('11111111111111111111111111111111'),
        startTime: now - 3600000,
        endTime: now + 82800000,
        timeLockEnd: now + 172800000,
        voteWeights: { yes: 0, no: 0, abstain: 0 },
        votes: [],
        yesVotes: 0,
        noVotes: 0,
        quorumRequired: 100,
        executionTime: now + 172800000,
        quorum: 100,
        status: 'active',
        ...overrides
    };
}

describe('GovernanceManager', () => {
    let connection: jest.Mocked<Connection>;
    let wallet: Keypair;
    let governanceManager: GovernanceManager;
    let mockProposalData: ProposalData;
    let getAccountInfoMock: jest.SpyInstance;
    let simulateTransactionMock: MockMethod<RpcResponseAndContext<SimulatedTransactionResponse>>;
    let sendTransactionMock: MockMethod<string>;
    let proposalAddress: PublicKey;

    beforeAll(() => {
        // Set up shared test constants
        wallet = Keypair.generate();
        proposalAddress = new PublicKey('11111111111111111111111111111111');
    });

    beforeEach(async () => {
        // Reset mocks and use fake timers
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Setup Transaction mock first since it's needed by Connection
        const TransactionMock = jest.fn().mockImplementation(() => ({
            instructions: [],
            recentBlockhash: 'mock-blockhash',
            feePayer: wallet?.publicKey || null,
            signatures: [],
            add: function(...instructions: any[]) {
                this.instructions.push(...instructions.flat());
                return this;
            },
            sign: jest.fn(),
            serialize: () => Buffer.alloc(100),
            verifySignatures: () => true,
            lastValidBlockHeight: 1000
        }));

        jest.mock('@solana/web3.js', () => ({
            ...jest.requireActual('@solana/web3.js'),
            Transaction: TransactionMock
        }));
        // Set up mocked response values for simulation
        const mockSimulateResponse: RpcResponseAndContext<SimulatedTransactionResponse> = {
            context: { slot: 0 },
            value: {
                err: null,
                logs: ['Program execution succeeded'],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        };

        // Initialize mock connection
        connection = new MockConnection() as unknown as jest.Mocked<Connection>;
        
        // Set up simulation mock with proper implementation
        simulateTransactionMock = jest.fn().mockResolvedValue({
            context: { slot: 0 },
            value: {
                err: null,
                logs: ['Program log: Instruction: CreateProposal', 'Program execution succeeded'],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        });

        sendTransactionMock = jest.fn().mockResolvedValue('mock-signature');

        // Configure mocks once
        connection.simulateTransaction = simulateTransactionMock;
        connection.sendTransaction = sendTransactionMock;
        
        // Assign mocks to connection and store references
        connection.simulateTransaction = simulateTransactionMock;
        connection.sendTransaction = sendTransactionMock;
        
        // Initialize getAccountInfo mock
        connection.getAccountInfo = jest.fn().mockImplementation(() => {
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

        // Update references to connection's mock methods
        simulateTransactionMock = connection.simulateTransaction as jest.Mock;
        sendTransactionMock = connection.sendTransaction as jest.Mock;
        getAccountInfoMock = connection.getAccountInfo as jest.Mock;

        // Setup Redis mock with proper offline queue handling
        global.__REDIS__ = {
            status: 'ready',
            connected: true,
            connection_options: { keyPrefix: 'test:', enableOfflineQueue: true },
            get: jest.fn().mockResolvedValue('0'),
            set: jest.fn().mockResolvedValue('OK'),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
            flushall: jest.fn().mockResolvedValue('OK'),
            hget: jest.fn().mockResolvedValue(null),
            hset: jest.fn().mockResolvedValue('OK'),
            exists: jest.fn().mockResolvedValue(0),
            del: jest.fn().mockResolvedValue(1),
            connect: jest.fn().mockImplementation(async () => {
                global.__REDIS__.status = 'ready';
                global.__REDIS__.connected = true;
                return Promise.resolve();
            }),
            disconnect: jest.fn().mockResolvedValue(undefined),
            quit: jest.fn().mockResolvedValue('OK')
        };
        
        // Set a fixed base time (e.g., Jan 1, 2024)
        const mockBaseTime = 1704067200000; // 2024-01-01T00:00:00.000Z
        jest.setSystemTime(mockBaseTime);
        wallet = Keypair.generate();
        proposalAddress = new PublicKey('11111111111111111111111111111111');

        // Initialize governance manager
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
        );

        // Setup base mock proposal data
        mockProposalData = {
            state: ProposalState.Active,
            executed: false,
            title: "Test Proposal",
            description: "Test Description", 
            proposer: wallet.publicKey,
            startTime: mockBaseTime - 3600000, // Started 1 hour ago
            endTime: mockBaseTime + 82800000, // Ends in 23 hours
            timeLockEnd: mockBaseTime + 172800000,
            voteWeights: { yes: 0, no: 0, abstain: 0 },
            votes: [],
            yesVotes: 0,
            noVotes: 0,
            quorumRequired: 100,
            executionTime: mockBaseTime + 172800000,
            quorum: 100,
            status: 'active'
        };

        // Setup mock account data with proper proposal state
        const mockAccountData = {
            data: Buffer.alloc(392), // Minimum buffer size for proposal data
            executable: false,
            lamports: 1000000,
            owner: new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
            rentEpoch: 0
        };

        // Update references to mocks
        // Set up mock proposal data based on current timestamp
        const currentTime = Date.now();
        
        // Override the proposal state for this test
        jest.spyOn(governanceManager, 'getProposalState')
            .mockImplementation(async () => ({
                ...mockProposalData,
                state: ProposalState.Succeeded,
                status: 'succeeded',
                timeLockEnd: currentTime - 1000, // Make sure time lock has passed
                quorumRequired: 100
            }));

        // Mock getVoteCount to meet quorum requirements
        jest.spyOn(governanceManager as any, 'getVoteCount')
            .mockResolvedValue({
                yes: 150,
                no: 50,
                abstain: 0
            });
        mockProposalData = {
            state: ProposalState.Succeeded,
            executed: false,
            title: "Test Proposal",
            description: "Test Description",
            proposer: wallet.publicKey,
            startTime: currentTime - 1000,
            endTime: currentTime + 86400000, // +24h
            timeLockEnd: currentTime + 172800000, // +48h
            voteWeights: { yes: 150, no: 50, abstain: 0 },
            votes: [],
            yesVotes: 150,
            noVotes: 50,
            quorumRequired: 100,
            executionTime: currentTime + 172800000, // +48h
            quorum: 100,
            status: 'succeeded'
        };
        });

    afterEach(async () => {
        try {
            jest.useRealTimers();
            jest.clearAllMocks();
            
            if (simulateTransactionMock) simulateTransactionMock.mockClear();
            if (sendTransactionMock) sendTransactionMock.mockClear();
            if (getAccountInfoMock) {
                getAccountInfoMock.mockClear();
                getAccountInfoMock.mockReset();
            }
            
            // Reset any spies
            } catch (error: unknown) {
        } catch (error) {
            console.error('Error during test cleanup:', error);
        }

        // Clean up Redis mock
        try {
            await global.__REDIS__?.flushall();
            await global.__REDIS__?.quit();
        } catch (error) {
            console.error('Error cleaning up Redis mock:', error);
        }
    });

    describe('proposal creation', () => {
        it('should create a proposal with valid parameters', async () => {
            
            // Setup transaction success with confirmation
            sendTransactionMock.mockImplementation(async (tx, signers) => {
                expect(tx).toBeDefined();
                expect(signers).toContain(wallet);
                
                // Simulate the transaction first
                await simulateTransactionMock(tx);
                
                return 'mock-signature';
            });

            // Ensure simulation mock is properly configured
            simulateTransactionMock.mockImplementation(async (tx) => {
                expect(tx).toBeDefined();
                return {
                    context: { slot: 0 },
                    value: {
                        err: null,
                        logs: ['Program log: Instruction executed successfully'],
                        accounts: null,
                        unitsConsumed: 0,
                        returnData: null
                    }
                };
            });

            // Setup transaction simulation success
            simulateTransactionMock.mockResolvedValueOnce({
                context: { slot: 0 },
                value: {
                    err: null,
                    logs: ['Program log: Instruction executed successfully'],
                    accounts: null,
                    unitsConsumed: 0,
                    returnData: null
                }
            });

            // Create proposal
            const result = await governanceManager.createProposalAccount(
                connection as unknown as Connection, 
                wallet,
                {
                    title: "Test Proposal",
                    description: "Test Description",
                    votingPeriod: 86400 // 24 hours in seconds
                }
            );
            
            // Verify proposal creation result
            expect(result.proposalAddress).toBeDefined();
            expect(result.tx).toBeInstanceOf(Transaction);
            
            // Verify transaction simulation was called
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(simulateTransactionMock.mock.calls[0][0]).toBeInstanceOf(Transaction);
            
            // Execute the transaction
            await connection.sendTransaction(result.tx, [wallet]);
            
            // Verify transaction sending
            expect(sendTransactionMock).toHaveBeenCalledWith(
                expect.any(Transaction),
                expect.arrayContaining([wallet])
            );
        });
    });
    describe('voting', () => {
        it('should successfully vote on an active proposal', async () => {
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(100);

            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue({
                    ...mockProposalData,
                    state: ProposalState.Active
                });


            // Cast vote
            const voteTx = await governanceManager.castVote(
                connection as unknown as Connection,
                wallet,
                proposalAddress,
                true
            );

            expect(voteTx).toBeInstanceOf(Transaction);
            
            // Verify transaction simulation was called
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(simulateTransactionMock.mock.calls[0][0]).toBeInstanceOf(Transaction);
            
            // Execute the vote transaction
            await connection.sendTransaction(voteTx, [wallet]);
            
            // Verify transaction sending
            expect(sendTransactionMock).toHaveBeenCalledWith(
                expect.any(Transaction),
                expect.arrayContaining([wallet])
            );
        });

        it('should reject vote if voter has already voted', async () => {
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(100);

            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue({
                    ...mockProposalData,
                    state: ProposalState.Active
                });

            jest.spyOn(governanceManager as any, 'hasVoted')
                .mockResolvedValue(true);

            await expect(
                governanceManager.castVote(connection, wallet, proposalAddress, true)
            ).rejects.toThrow('Already voted');
        });

        it('should reject vote if voting period has expired', async () => {
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(100);

            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue({
                    ...mockProposalData,
                    endTime: Date.now() - 3600000 // Ended 1 hour ago
                });

            await expect(
                governanceManager.castVote(connection, wallet, proposalAddress, true)
            ).rejects.toThrow('Voting period has ended');
        });

        it('should reject vote if proposal is not active', async () => {
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(100);

            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue({
                    ...mockProposalData,
                    state: 'Defeated',
                    status: 'defeated'
                });

            await expect(
                governanceManager.castVote(connection, wallet, proposalAddress, true)
            ).rejects.toThrow('Proposal is not in voting state');
        });

        it('should reject vote if voter has insufficient voting power', async () => {
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(0);

            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue({
                    ...mockProposalData,
                    state: ProposalState.Active
                });

            await expect(
                governanceManager.castVote(connection, wallet, proposalAddress, true)
            ).rejects.toThrow('Insufficient voting power');
        });
    });
    describe('proposal execution', () => {
        it('should fail to execute if quorum is not met', async () => {
            // Mock getVoteCount to meet quorum requirements
            jest.spyOn(governanceManager as any, 'getVoteCount')
                .mockResolvedValue({
                    yes: 50,
                    no: 20,
                    abstain: 0
                });

            jest.spyOn(governanceManager, 'getProposalState')
                .mockImplementation(async () => ({
                    ...mockProposalData,
                    state: ProposalState.Succeeded,
                    quorumRequired: 100
                }));

            await expect(
                governanceManager.executeProposal(connection, wallet, proposalAddress)
            ).rejects.toThrow('Proposal has not reached quorum');
        });
    }); // End of proposal execution describe block
}); // End of GovernanceManager describe block
});  // End of proposal execution describe block
}); // End of GovernanceManager describe block
