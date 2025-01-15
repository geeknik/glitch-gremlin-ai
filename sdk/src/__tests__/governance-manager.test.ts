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

    simulateTransaction = jest.fn().mockImplementation(async () => ({
        context: { slot: 0 },
        value: {
            err: null,
            logs: [],
            accounts: null,
            unitsConsumed: 0,
            returnData: null
        }
    }));

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
    votes: Array<{voter: PublicKey}>;
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
    let validateProposalMock: jest.SpyInstance;
    let getAccountInfoMock: jest.SpyInstance;
    let simulateTransactionMock: jest.SpyInstance;
    let sendTransactionMock: jest.SpyInstance;
    let proposalAddress: PublicKey;

    beforeEach(async () => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup connection mock
        connection = new MockConnection();

        // Setup mock account data
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
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
        );

        mockProposalData = {
            state: ProposalState.Active,
            executed: false,
            title: "Test Proposal",
            description: "Test Description",
            proposer: wallet.publicKey,
            startTime: Date.now() - 1000,
            endTime: Date.now() + 86400000,
            timeLockEnd: Date.now() + 172800000,
            voteWeights: { yes: 0, no: 0, abstain: 0 },
            votes: [],
            yesVotes: 0,
            noVotes: 0,
            quorumRequired: 100,
            executionTime: Date.now() + 172800000,
            quorum: 100,
            status: 'active'
        };

        validateProposalMock = jest.spyOn(governanceManager as any, 'validateProposal').mockResolvedValue(mockProposalData);

        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo');
        simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction');
        sendTransactionMock = jest.spyOn(connection, 'sendTransaction');
        proposalAddress = Keypair.generate().publicKey;
    });

    afterEach(async () => {
        // Cleanup mocks and reset state
        jest.restoreAllMocks();
        await connection.simulateTransaction.mockClear();
        await connection.sendTransaction.mockClear();
        wallet = Keypair.generate();
    });

    describe('proposal creation', () => {
        it('should create a proposal with valid parameters', async () => {
            // Setup mock data
            const mockProposalPubkey = new PublicKey(Keypair.generate().publicKey);
            validateProposalMock.mockResolvedValueOnce(mockProposalData);
            simulateTransactionMock.mockResolvedValueOnce({
                context: { slot: 0 },
                value: { err: null }
            });

            const { proposalAddress } = await governanceManager.createProposalAccount(
                connection,
                wallet,
                {
                    title: "Test Proposal",
                    description: "Test Description",
                    votingPeriod: 86400 // 24 hours in seconds
                }
            );
            expect(proposalAddress).toBeDefined();
            expect(validateProposalMock).toHaveBeenCalled();
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });
    });
    describe('voting', () => {
        it('should vote on a proposal', async () => {
            // Setup mock proposal state
            const mockProposalState = {
                state: ProposalState.Active,
                executed: false,
                title: "Test Proposal",
                description: "Test Description",
                proposer: wallet.publicKey,
                startTime: Date.now() - 1000,
                endTime: Date.now() + 86400000,
                voteWeights: { yes: 0, no: 0, abstain: 0 }
            };

            validateProposalMock.mockResolvedValueOnce(mockProposalState);
            connection.getAccountInfo.mockResolvedValueOnce({
                data: Buffer.alloc(392), // Proper size buffer with mock data
                executable: false,
                lamports: 1000000,
                owner: new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
                rentEpoch: 0
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
    });
    describe('proposal execution', () => {
        it('should execute a proposal', async () => {
            // Create a proper binary layout for proposal data
            const proposalBuffer = Buffer.alloc(1024); // Adjust size based on actual layout
            proposalBuffer.write("Test Proposal", 0, 64); // Title: 64 bytes
            proposalBuffer.write("Test Description", 64, 256); // Description: 256 bytes
            proposalBuffer.writeUInt8(ProposalState.Succeeded, 320); // State: 1 byte
            proposalBuffer.writeUInt8(0, 321); // Executed: 1 byte
            wallet.publicKey.toBuffer().copy(proposalBuffer, 322); // Proposer: 32 bytes
            proposalBuffer.writeBigUInt64LE(BigInt(Date.now() - 1000), 354); // StartTime
            proposalBuffer.writeBigUInt64LE(BigInt(Date.now() - 1000), 362); // EndTime
            proposalBuffer.writeBigUInt64LE(BigInt(100), 370); // Yes votes
            proposalBuffer.writeBigUInt64LE(BigInt(50), 378); // No votes

            getAccountInfoMock.mockResolvedValueOnce({
                data: proposalBuffer,
                executable: false,
                lamports: 0,
                owner: PublicKey.default,
                rentEpoch: 0
            });
            const result = await governanceManager.executeProposal(connection, wallet, proposalAddress);
            expect(result).toBeInstanceOf(Transaction);
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });
    });
});
