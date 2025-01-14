import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import type { MockedFunction, SpyInstance } from 'jest-mock';
import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    AccountInfo,
    Commitment,
    SimulatedTransactionResponse,
    RpcResponseAndContext,
    Signer,
    SendOptions,
    GetProgramAccountsConfig,
    GetBalanceConfig,
    VersionedTransaction,
    Message,
    SimulateTransactionConfig
} from '@solana/web3.js';
import { ProposalState } from '../types';
import { GovernanceManager } from '../governance';
import { ErrorCode, GlitchError } from '../errors';

type MockedConnection = {
    [K in keyof Connection]: Connection[K] extends (...args: any) => any
        ? jest.Mock<ReturnType<Connection[K]>, Parameters<Connection[K]>>
        : Connection[K];
} & Connection;
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
    let connection: MockedConnection;
    let wallet: Keypair;
    let governanceManager: GovernanceManager;
    let mockProposalData: ProposalData;
    let validateProposalMock: jest.SpyInstance;
    let getAccountInfoMock: jest.SpyInstance;
    let simulateTransactionMock: jest.SpyInstance;
    let sendTransactionMock: jest.SpyInstance;
    let proposalAddress: PublicKey;

    beforeEach(() => {
        connection = {
            commitment: 'confirmed',
            rpcEndpoint: 'http://localhost:8899',
            getAccountInfo: jest.fn().mockResolvedValue({
                data: Buffer.alloc(0),
                executable: false,
                lamports: 0,
                owner: PublicKey.default,
                rentEpoch: 0
            }),
            sendTransaction: jest.fn().mockResolvedValue('mock-signature'),
            simulateTransaction: jest.fn().mockResolvedValue({
                context: { slot: 0 },
                value: {
                    err: null,
                    logs: [],
                    accounts: null,
                    unitsConsumed: 0,
                    returnData: null
                }
            }),
            getLatestBlockhash: jest.fn().mockResolvedValue({
                blockhash: 'mock-blockhash',
                lastValidBlockHeight: 1000
            }),
            getRecentBlockhash: jest.fn().mockResolvedValue({
                blockhash: 'mock-blockhash',
                feeCalculator: { lamportsPerSignature: 5000 }
            }),
            getBalance: jest.fn().mockResolvedValue(1000000),
            getProgramAccounts: jest.fn().mockResolvedValue([]),
            getVersion: jest.fn().mockResolvedValue({
                'feature-set': 1,
                'solana-core': '1.18.26'
            }),
            getSlot: jest.fn().mockResolvedValue(0),
            getTokenAccountsByOwner: jest.fn().mockResolvedValue({
                context: { slot: 0 },
                value: []
            })
        } as unknown as MockedConnection;

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

        validateProposalMock = jest.spyOn(governanceManager as any, 'validateProposal')
            .mockImplementation(() => Promise.resolve(mockProposalData));

        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo');
        simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction');
        sendTransactionMock = jest.spyOn(connection, 'sendTransaction');

        proposalAddress = new PublicKey(Keypair.generate().publicKey);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('proposal creation', () => {
        it('should create a proposal with valid parameters', async () => {
            const { proposalAddress } = await governanceManager.createProposalAccount(
                connection,
                wallet,
                {
                    title: "Test Proposal",
                    description: "Test Description",
                    targetProgram: "11111111111111111111111111111111",
                    testParams: {
                        testType: 'FUZZ',
                        duration: 300,
                        intensity: 5,
                        targetProgram: "11111111111111111111111111111111"
                    },
                    stakingAmount: 1000
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
            const vote = await governanceManager.voteOnProposal(
                connection,
                wallet,
                proposalAddress,
                true
            );
            expect(vote).toBe('mock-signature');
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });
    });
    describe('proposal execution', () => {
        it('should execute a proposal', async () => {
            getAccountInfoMock.mockResolvedValueOnce({
                data: Buffer.from(JSON.stringify({
                    status: 'active',
                    endTime: Date.now() - 1000,
                    executionTime: Date.now() - 1000,
                    voteWeights: {
                        yes: 100,
                        no: 50,
                        abstain: 0
                    },
                    quorum: 100
                })),
                executable: false,
                lamports: 0,
                owner: PublicKey.default,
                rentEpoch: 0
            });
            const result = await governanceManager.executeProposal(connection, wallet, proposalAddress);
            expect(result).toBe('mock-signature');
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });
    });
});
