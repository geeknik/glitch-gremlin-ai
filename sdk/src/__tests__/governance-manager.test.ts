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

// Mock PublicKey constructor
jest.mock('@solana/web3.js', () => {
    const original = jest.requireActual('@solana/web3.js');
    return {
        ...original,
        PublicKey: jest.fn().mockImplementation((key) => ({
            toBase58: () => typeof key === 'string' ? key : 'mock-pubkey',
            toString: () => 'mock-pubkey',
            toBuffer: () => Buffer.alloc(32),
            equals: (other) => true
        }))
    };
});

class MockConnection extends Connection {
    constructor() {
        super('http://localhost:8899');
    }

    getAccountInfo = jest.fn().mockImplementation(async () => ({
        data: Buffer.alloc(0),
        executable: false,
        lamports: 0,
        owner: PublicKey.default,
        rentEpoch: 0
    }));

    sendTransaction = jest.fn().mockImplementation(async (transaction: Transaction | VersionedTransaction) => {
        return 'mock-signature';
    });

    simulateTransaction = jest.fn().mockImplementation(async (transaction: Transaction | VersionedTransaction) => {
        // Simulate successful transaction
        return {
            context: { slot: 0 },
            value: {
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        };
    });

    getAccountInfo = jest.fn().mockImplementation(async (publicKey: PublicKey) => {
        // Return mock proposal account data
        return {
            data: Buffer.alloc(392),
            executable: false,
            lamports: 1000000,
            owner: new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
            rentEpoch: 0
        };
    });

    getLatestBlockhash = jest.fn().mockImplementation(async () => ({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 1000
    }));

    getBalance = jest.fn().mockImplementation(async () => 1000000);

    getProgramAccounts = jest.fn().mockImplementation(async () => ({
        context: { slot: 0 },
        value: []
    }));

    getSlot = jest.fn().mockImplementation(async () => 0);
}
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

describe('GovernanceManager', () => {
    let connection: MockConnection;
    let wallet: Keypair;
    let governanceManager: GovernanceManager;
    let mockProposalData: ProposalData;
    let getAccountInfoMock: jest.SpyInstance;
    let simulateTransactionMock: jest.SpyInstance;
    let sendTransactionMock: jest.SpyInstance;
    let proposalAddress: PublicKey;

    beforeEach(async () => {
        // Reset mocks and use fake timers
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        // Set a fixed base time (e.g., Jan 1, 2024)
        const mockBaseTime = 1704067200000; // 2024-01-01T00:00:00.000Z
        jest.setSystemTime(mockBaseTime);

        // Setup connection mock
        connection = new MockConnection();
        wallet = Keypair.generate();
        proposalAddress = new PublicKey('ProposalAddressAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        
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

        connection.getAccountInfo.mockResolvedValue(mockAccountData);

        connection.sendTransaction.mockResolvedValue('mock-signature');

        connection.simulateTransaction.mockResolvedValue({
            context: { slot: 0 },
            value: {
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        });

        connection.getLatestBlockhash.mockResolvedValue({
            blockhash: 'mock-blockhash',
            lastValidBlockHeight: 1000
        });

        connection.getBalance.mockResolvedValue(1000000);
        connection.getProgramAccounts.mockResolvedValue([]);
        connection.getSlot.mockResolvedValue(0);
        // Setup mock spies
        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo');
        simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction');
        sendTransactionMock = jest.spyOn(connection, 'sendTransaction');
        
        // Set up mock proposal data based on current timestamp
        const currentTime = Date.now();
        mockProposalData = {
            state: ProposalState.Active,
            executed: false,
            title: "Test Proposal",
            description: "Test Description",
            proposer: wallet.publicKey,
            startTime: currentTime - 1000,
            endTime: currentTime + 86400000, // +24h
            timeLockEnd: currentTime + 172800000, // +48h
            voteWeights: { yes: 0, no: 0, abstain: 0 },
            votes: [],
            yesVotes: 0,
            noVotes: 0,
            quorumRequired: 100,
            executionTime: currentTime + 172800000, // +48h
            quorum: 100,
            status: 'active'
        };

        // Add proposal state mock
        jest.spyOn(governanceManager, 'getProposalState')
            .mockImplementation(async () => {
                const currentTime = Date.now();
                return {
                    state: ProposalState.Draft,
                    executed: false,
                    title: "Test Proposal",
                    description: "Test Description",
                    proposer: wallet.publicKey,
                    startTime: currentTime - 1000,
                    endTime: currentTime + 86400000,
                    timeLockEnd: currentTime + 172800000,
                    voteWeights: { yes: 0, no: 0, abstain: 0 },
                    votes: [],
                    yesVotes: 0,
                    noVotes: 0,
                    quorumRequired: 100,
                    executionTime: currentTime + 172800000,
                    quorum: 100,
                    status: 'draft'
                };
            });
    });

    afterEach(() => {
        // Reset timers and mocks after each test
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('proposal creation', () => {
        it('should create a proposal with valid parameters', async () => {
            const { proposalAddress, tx } = await governanceManager.createProposalAccount(
                connection, 
                wallet,
                {
                    title: "Test Proposal",
                    description: "Test Description",
                    votingPeriod: 86400 // 24 hours in seconds
                }
            );
            
            expect(proposalAddress).toBeDefined();
            expect(tx).toBeInstanceOf(Transaction);
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
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

            const vote = await governanceManager.castVote(
                connection,
                wallet,
                proposalAddress,
                true
            );

            expect(vote).toBeInstanceOf(Transaction);
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });

        it('should reject vote if voter has already voted', async () => {
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(100);

            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue({
                    ...mockProposalData,
                    votes: [{
                        voter: wallet.publicKey,
                        vote: true,
                        votingPower: 100,
                        timestamp: Date.now() - 1000
                    }]
                });

            await expect(
                governanceManager.castVote(connection, wallet, proposalAddress, true)
            ).rejects.toThrow('Already voted on this proposal');
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
                    state: ProposalState.Defeated
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
        it('should execute a proposal when conditions are met', async () => {
            // Mock getVoteCount to meet quorum requirements
            jest.spyOn(governanceManager as any, 'getVoteCount')
                .mockResolvedValue({
                    yes: 150,
                    no: 50,
                    abstain: 0
                });

            // Override the proposal state for this test
            const currentTime = Date.now();
            jest.spyOn(governanceManager, 'getProposalState')
                .mockImplementation(async () => ({
                    ...mockProposalData,
                    state: ProposalState.Succeeded,
                    status: 'succeeded',
                    timeLockEnd: currentTime - 1000, // Make sure time lock has passed
                    quorumRequired: 100
                }));

            // Advance the timer past the time lock period
            jest.advanceTimersByTime(172800000 + 1000); // 48h + 1s
            
            const result = await governanceManager.executeProposal(connection, wallet, proposalAddress);
            
            expect(result).toBeInstanceOf(Transaction);
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });

        it('should fail to execute if quorum is not met', async () => {
            // Mock low vote count
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
            ).rejects.toThrow('Cannot execute: Required quorum');
        });
    });
});
