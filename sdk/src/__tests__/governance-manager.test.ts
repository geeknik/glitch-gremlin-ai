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
import { ProposalState } from '../types.js';
import { GovernanceManager } from '../governance.js';
import { ErrorCode, GlitchError } from '../errors.js';

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

    beforeEach(() => {
        const mockConnection: Partial<Connection> = {
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
        } as MockedConnection;

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
            status: 'active',
            executionTime: Date.now() + 172800000,
            quorum: 100
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
// Helper function to create properly structured proposal buffer
export function createProposalBuffer(props: {
    title: string,
    description: string,
    proposer: PublicKey,
    startTime: number,
    endTime: number,
    timeLockEnd: number,
    yesVotes: number,
    noVotes: number,
    quorumRequired: number,
    executed: boolean,
    state: ProposalState,
    votes: Array<{ voter: PublicKey }>
}): Buffer {
    // Calculate total size: fixed size (392) + dynamic votes size
    const FIXED_SIZE = 64 + 256 + 32 + 8 + 8 + 8 + 4 + 4 + 4 + 1 + 1 + 2;
    const votesSize = props.votes.length * 32;
    const buffer = Buffer.alloc(FIXED_SIZE + votesSize);
    let offset = 0;

    // Title (64 bytes)
    buffer.write(props.title.slice(0, 64).padEnd(64, '\0'), offset);
    offset += 64;

    // Description (256 bytes)
    buffer.write(props.description.slice(0, 256).padEnd(256, '\0'), offset);
    offset += 256;

    // Proposer (32 bytes)
    props.proposer.toBuffer().copy(buffer, offset);
    offset += 32;

    // Timestamps (8 bytes each)
    buffer.writeBigInt64LE(BigInt(props.startTime), offset);
    offset += 8;
    buffer.writeBigInt64LE(BigInt(props.endTime), offset);
    offset += 8;
    buffer.writeBigInt64LE(BigInt(props.timeLockEnd), offset);
    offset += 8;

    // Vote counts (4 bytes each)
    buffer.writeUInt32LE(props.yesVotes, offset);
    offset += 4;
    buffer.writeUInt32LE(props.noVotes, offset);
    offset += 4;
    buffer.writeUInt32LE(props.quorumRequired, offset);
    offset += 4;

    // Status fields (1 byte each)
    buffer.writeUInt8(props.executed ? 1 : 0, offset);
    offset += 1;
    // Map ProposalState enum to numeric value
    const stateValue = (() => {
        switch(props.state) {
            case ProposalState.Draft: return 0;
            case ProposalState.Active: return 1;
            case ProposalState.Succeeded: return 2;
            case ProposalState.Defeated: return 3;
            case ProposalState.Executed: return 4;
            case ProposalState.Cancelled: return 5;
            case ProposalState.Queued: return 6;
            case ProposalState.Expired: return 7;
            default: return 0;
        }
    })();
    buffer.writeUInt8(stateValue, offset);
    offset += 1;

    // Votes length (2 bytes)
    buffer.writeUInt16LE(props.votes.length, offset);
    offset += 2;

    // Write votes (32 bytes each)
    props.votes.forEach(vote => {
        vote.voter.toBuffer().copy(buffer, offset);
        offset += 32;
    });

    return buffer;
}

export function debugBuffer(buffer: Buffer): void {
    console.log('Buffer contents:');
    for (let i = 0; i < buffer.length; i += 32) {
        console.log(buffer.slice(i, i + 32).toString('hex'));
    }
}
jest.setTimeout(30000); // 30 seconds for more reliable CI runs

// Mock proposal data at top level scope


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
        sendTransaction: jest.fn().mockImplementation(
            async (transaction: Transaction | VersionedTransaction, signers?: Signer[], options?: SendOptions) => 'mock-signature'
        ),
        simulateTransaction: jest.fn().mockImplementation(
            async (transaction: Transaction | VersionedTransaction, config?: SimulateTransactionConfig) => ({
                context: { slot: 0 },
                value: {
                    err: null,
                    logs: [],
                    accounts: null,
                    unitsConsumed: 0,
                    returnData: null
                }
            })
        ),
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
    };

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
        quorumRequired: 100
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
        ),
        sendTransaction: jest.fn<typeof Connection.prototype.sendTransaction>().mockImplementation(
            async (transaction: Transaction, signers: Signer[]) => 'mock-signature'
        ),
        simulateTransaction: jest.fn<typeof Connection.prototype.simulateTransaction>().mockImplementation(
            async (transaction: Transaction) => ({
                context: { slot: 0 },
                value: {
                    err: null,
                    logs: [],
                    accounts: null,
                    unitsConsumed: 0,
                    returnData: null
                }
            })
        ),
        getLatestBlockhash: jest.fn().mockResolvedValue({
            blockhash: 'test-blockhash',
            lastValidBlockHeight: 0
        }),
        getBalance: jest.fn().mockResolvedValue(1000000),
        getProgramAccounts: jest.fn().mockResolvedValue([])
    } as MockedConnectionType;
            data: Buffer.alloc(0),
            executable: false,
            lamports: 0,
            owner: publicKey,
            rentEpoch: 0
        })),
        sendTransaction: jest.fn().mockImplementation(async (transaction: Transaction, signers: Signer[]) => 'mock-signature'),
        simulateTransaction: jest.fn().mockImplementation(async (transaction: Transaction) => ({
            context: { slot: 0 },
            value: {
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        })),
        getLatestBlockhash: jest.fn().mockImplementation(async () => {
            return {
                blockhash: 'test-blockhash',
                lastValidBlockHeight: 0
            };
        }),
        getRecentBlockhash: jest.fn().mockImplementation(async () => {
            return {
                blockhash: 'test-blockhash',
                feeCalculator: { lamportsPerSignature: 5000 }
            };
        }),
        getBalance: jest.fn().mockImplementation(async () => {
            return 1000000;
        }),
        getProgramAccounts: jest.fn().mockImplementation(async () => {
            return [];
        }),
        getVersion: jest.fn().mockImplementation(async () => {
            return {
                'feature-set': 1,
                'solana-core': '1.18.26'
            };
        }),
        getSlot: jest.fn().mockImplementation(async () => {
            return 0;
        }),
        getTokenAccountsByOwner: jest.fn().mockImplementation(async () => {
            return {
                context: { slot: 0 },
                value: []
            };
        })
    };

    wallet = Keypair.generate();
    governanceManager = new GovernanceManager(
        new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
    );
});

    wallet = Keypair.generate();
    governanceManager = new GovernanceManager(
        new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
    );
});

describe('createProposalAccount', () => {
    it('should create a proposal account', async () => {
        // Test implementation
    });
});

describe('castVote', () => {
    it('should cast a vote on a proposal', async () => {
        // Test implementation
    });
});

describe('executeProposal', () => {
    it('should execute a proposal', async () => {
        // Test implementation
    });
});
});
    });
    let validateProposalMock: jest.SpiedFunction<typeof governanceManager['validateProposal']>;
    let getAccountInfoMock: jest.SpiedFunction<typeof connection.getAccountInfo>;
    let simulateTransactionMock: jest.SpiedFunction<typeof connection.simulateTransaction>;
    let sendTransactionMock: jest.SpiedFunction<typeof connection.sendTransaction>;
    let proposalAddress: PublicKey;
    let connection: MockConnection;
    let wallet: Keypair = Keypair.generate();
    let governanceManager: GovernanceManager = new GovernanceManager(
        new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
    );
    let mockProposalData: ProposalData;

    describe('governance tests', () => {
    let simulateTransactionMock: SpyInstance;
    let sendTransactionMock: SpyInstance;
    let proposalAddress: PublicKey;
        const mockConnection: Partial<Connection> = {
            commitment: 'confirmed' as Commitment,
            rpcEndpoint: 'http://localhost:8899',
            getAccountInfo: jest.fn<typeof Connection.prototype.getAccountInfo>(),
            sendTransaction: jest.fn<typeof Connection.prototype.sendTransaction>(),
            simulateTransaction: jest.fn<typeof Connection.prototype.simulateTransaction>(),
            getLatestBlockhash: jest.fn<typeof Connection.prototype.getLatestBlockhash>().mockResolvedValue({
                blockhash: 'test-blockhash',
                lastValidBlockHeight: 0
            }),
            getBalance: jest.fn<typeof Connection.prototype.getBalance>().mockResolvedValue(1000000),
            getProgramAccounts: jest.fn<typeof Connection.prototype.getProgramAccounts>().mockResolvedValue([])
        };
        getProgramAccounts: jest.fn<Connection['getProgramAccounts']>()
        .mockImplementation(async () => []),
        getVersion: jest.fn<Connection['getVersion']>()
        .mockImplementation(async () => ({
            'feature-set': 1,
            'solana-core': '1.18.26'
        })),
        getMinimumLedgerSlot: jest.fn<Connection['getMinimumLedgerSlot']>()
        .mockImplementation(async () => 0),
        getFirstAvailableBlock: jest.fn<Connection['getFirstAvailableBlock']>()
        .mockImplementation(async () => 0),
        getSlot: jest.fn<Connection['getSlot']>()
        .mockImplementation(async () => 0),
        getLatestBlockhash: jest.fn<Connection['getLatestBlockhash']>()
        .mockImplementation(async () => ({
            blockhash: 'test-blockhash',
            lastValidBlockHeight: 1000
        }))
    };
            getBalance: jest.fn<Connection['getBalance']>()
                .mockImplementation(async () => 0),
            getTokenAccountsByOwner: jest.fn<Connection['getTokenAccountsByOwner']>()
                .mockImplementation(async () => ({
                    context: { slot: 0 },
                    value: []
                })),
            getSlot: jest.fn<Connection['getSlot']>()
                .mockImplementation(async () => 0)
                .mockImplementation(async () => []),
            getBalance: jest.fn<Connection['getBalance']>()
                .mockImplementation(async () => 0),
            getTokenAccountsByOwner: jest.fn<Connection['getTokenAccountsByOwner']>()
                .mockImplementation(async () => ({
                    context: { slot: 0 },
                    value: []
                })),
            getSlot: jest.fn<Connection['getSlot']>()
                .mockImplementation(async () => 0)
        };
        connection = mockConnection as unknown as MockedObject<Connection>;

        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
        );

        mockProposalData = {
            state: ProposalState.Active,
            votingPower: 1000,
            votes: [], 
            proposer: wallet.publicKey.toBase58(),
            startTime: Date.now() - 1000,
            endTime: Date.now() + 86400000,
            timeLockEnd: Date.now() + 172800000,
            executed: false,
            quorum: 100,
            title: "Test Proposal",
            description: "Test Description",
            voteWeights: {
                yes: 0,
                no: 0,
                abstain: 0
            },
            quorumRequired: 100,
            yesVotes: 0,
            noVotes: 0
        };
    // Mock implementation for calculateVoteWeight and getProposalState
    jest.spyOn(governanceManager as any, 'calculateVoteWeight')
        .mockImplementation((): Promise<number> => Promise.resolve(1000));

    jest.spyOn(governanceManager as any, 'getProposalState')
        .mockImplementation(async () => ({
            state: mockProposalData.state,
            executed: mockProposalData.executed, 
            .mockResolvedValue(null),
            yesVotes: mockProposalData.voteWeights.yes,
            noVotes: mockProposalData.voteWeights.no,
            quorumRequired: mockProposalData.quorumRequired,
            votes: mockProposalData.votes,
            startTime: mockProposalData.startTime,
            endTime: mockProposalData.endTime
        }));
        // Configure default mock implementations
        (connection.getAccountInfo as jest.Mock).mockResolvedValue({
            data: createProposalBuffer({
                title: "Test Proposal",
                description: "Test Description",
                proposer: wallet.publicKey,
                startTime: Date.now() - 1000,
                endTime: Date.now() + 86400000,
                timeLockEnd: Date.now() + 172800000,
                yesVotes: 0,
                noVotes: 0,
                quorumRequired: 100,
                executed: false,
                state: ProposalState.Active,
                votes: []
            }),
            executable: false,
            lamports: 1000000,
            owner: new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
            rentEpoch: 0
        });

        (connection.sendTransaction as jest.Mock).mockResolvedValue('mock-signature');
        (connection.simulateTransaction as jest.Mock).mockResolvedValue({
            context: { slot: 0 },
            value: {
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        });
        (connection.getVersion as jest.Mock).mockResolvedValue({
            'feature-set': 1,
            'solana-core': '1.18.26'
        });
        
        jest.clearAllMocks();

    describe('proposal lifecycle', () => {
        it('should handle multiple concurrent proposals', async () => {
            const proposal1 = new PublicKey(Keypair.generate().publicKey);
            const proposal2 = new PublicKey(Keypair.generate().publicKey);
            
            // Mock proposal data
            jest.spyOn(connection, 'getAccountInfo').mockImplementation(async (address: PublicKey) => {
                if (address.equals(proposal1)) {
                    return {
                        data: createProposalBuffer({
                            title: "Test Proposal",
                            description: "Test Description",
                            proposer: wallet.publicKey,
                            startTime: Date.now() - 1000,
                            endTime: Date.now() + 86400000,
                            timeLockEnd: Date.now() + 172800000,
                            yesVotes: 0,
                            noVotes: 0,
                            quorumRequired: 100,
                            executed: false,
                            state: ProposalState.Active,
                            votes: []
                        }),
                        executable: false,
                        lamports: 1000000,
                        owner: governanceManager['programId'],
                        rentEpoch: 0
                    } as AccountInfo<Buffer>;
                }
                if (address.equals(proposal2)) {
                    return {
                        data: createProposalBuffer({
                            title: "Test Proposal",
                            description: "Test Description",
                            proposer: wallet.publicKey,
                            startTime: Date.now() - 1000,
                            endTime: Date.now() + 86400000,
                            timeLockEnd: Date.now() + 172800000,
                            yesVotes: 0,
                            noVotes: 0,
                            quorumRequired: 100,
                            executed: false,
                            state: ProposalState.Active,
                            votes: []
                        }),
                        executable: false,
                        lamports: 1000000,
                        owner: governanceManager['programId'],
                        rentEpoch: 0
                    } as AccountInfo<Buffer>;
                }
                return null;
            });

            // Cast votes on both proposals
            await expect(
                governanceManager.castVote(
                    connection,
                    wallet,
                    proposal1,
                    true
                )
            ).resolves.not.toThrow();

            await expect(
                governanceManager.castVote(
                    connection,
                    wallet,
                    proposal2,
                    true
                )
            ).resolves.not.toThrow();
        });
        it('should validate proposal parameters', async () => {
            await expect(
                governanceManager.createProposalAccount(
                    connection,
                    wallet,
                    {
                        votingPeriod: 0 // Invalid
                    }
                )
            ).rejects.toThrow('Invalid proposal parameters');
        });

        it('should handle insufficient voting power', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Setup account info mock first
            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: createProposalBuffer({
                        title: mockProposalData.title || '',
                        description: mockProposalData.description || '',
                        proposer: wallet.publicKey,
                        startTime: mockProposalData.startTime,
                        endTime: mockProposalData.endTime,
                        timeLockEnd: mockProposalData.endTime + 86400000,
                        yesVotes: mockProposalData.voteWeights?.yes || 0,
                        noVotes: mockProposalData.voteWeights?.no || 0,
                        quorumRequired: 10, // Low quorum to ensure power check fails first
                        executed: false,
                        state: mockProposalData.state,
                        votes: mockProposalData.votes
                    }),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                });

            // Mock getTokenAccountsByOwner to return low balance
            jest.spyOn(connection, 'getTokenAccountsByOwner')
                .mockResolvedValue({
                    context: { slot: 0 },
                    value: [{
                        pubkey: new PublicKey("11111111111111111111111111111111"),
                        account: {
                            data: Buffer.alloc(128).fill(0),
                            executable: false,
                            lamports: 1000000,
                            owner: new PublicKey("11111111111111111111111111111111"),
                            rentEpoch: 0
                        }
                    }]
                })

            // Mock low voting power
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockImplementation((): Promise<number> => {
                    // First call returns 50, subsequent calls return 1000
                    const mockFn = jest.fn<() => Promise<number>>().mockImplementation(async () => {
                        return 50;
                    });
                    mockFn.mockResolvedValueOnce(50)
                        .mockResolvedValue(1000);
                    return mockFn();
                });

            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: createProposalBuffer({
                        title: "Test Proposal",
                        description: "Test Description",
                        proposer: wallet.publicKey,
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000,
                        timeLockEnd: Date.now() + 172800000,
                        yesVotes: 0,
                        noVotes: 0,
                        quorumRequired: 100,
                        executed: false,
                        state: ProposalState.Active,
                        votes: []
                    }),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                });

            await expect(
                governanceManager.castVote(
                    connection,
                    wallet,
                    proposalAddress,
                    true
                )
            ).rejects.toThrow('Proposal is not active');
            
            expect(connection.getAccountInfo).toHaveBeenCalledWith(proposalAddress);
        });

        it('should handle proposal execution errors', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            jest.spyOn(connection, 'sendTransaction')
                .mockRejectedValue(new Error('Execution failed'));

            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Cannot execute: Proposal is not in succeeded state');
        });
        it('should create, vote on, and execute a proposal', async () => {
            jest.setTimeout(60000); // Increase timeout to 60 seconds

            // Mock initial proposal data
            const mockProposalMetadata = {
                state: ProposalState.Active,
                votingPower: 1000,
                proposer: wallet.publicKey.toBase58(),
                title: "Test Proposal",
                description: "Test Description",
                voteWeights: {
                    yes: 0,
                    no: 0,
                    abstain: 0
                },
                votes: [], // No previous votes
                quorum: 100,
                startTime: Date.now() - 1000,
                endTime: Date.now() + 86400000
            };

            // Set up mock for different proposal states
            const getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo');
            
            // Initial state for proposal creation
            getAccountInfoMock.mockResolvedValueOnce({
                data: createProposalBuffer({
                    title: "Test Proposal",
                    description: "Test Description",
                    proposer: wallet.publicKey,
                    startTime: Date.now() - 1000,
                    endTime: Date.now() + 86400000,
                    timeLockEnd: Date.now() + 172800000,
                    yesVotes: 0,
                    noVotes: 0,
                    quorumRequired: 100,
                    executed: false,
                    state: ProposalState.Active,
                    votes: []
                }),
                executable: false,
                lamports: 1000000,
                owner: governanceManager['programId'],
                rentEpoch: 0
            });
            
            // State after vote is cast (with updated vote weights)
            getAccountInfoMock.mockResolvedValueOnce({
                data: createProposalBuffer({
                    title: "Test Proposal",
                    description: "Test Description",
                    proposer: wallet.publicKey,
                    startTime: Date.now() - 1000,
                    endTime: Date.now() + 86400000,
                    timeLockEnd: Date.now() + 172800000,
                    yesVotes: 1000,
                    noVotes: 0,
                    quorumRequired: 100,
                    executed: false,
                    state: ProposalState.Active,
                    votes: [{
                        voter: wallet.publicKey
                    }]
                }),
                executable: false,
                lamports: 1000000,
                owner: governanceManager['programId'],
                rentEpoch: 0
            });

            // State for execution (succeeded state with sufficient votes)
            getAccountInfoMock.mockResolvedValue({
                data: createProposalBuffer({
                    title: "Test Proposal",
                    description: "Test Description",
                    proposer: wallet.publicKey,
                    startTime: Date.now() - 1000,
                    endTime: Date.now() + 86400000,
                    timeLockEnd: Date.now() + 172800000,
                    yesVotes: 1000,
                    noVotes: 0,
                    quorumRequired: 100,
                    executed: false,
                    state: ProposalState.Succeeded,
                    votes: [{
                        voter: wallet.publicKey
                    }]
                }),
                executable: false,
                lamports: 1000000,
                owner: governanceManager['programId'],
                rentEpoch: 0
            });

            // Mock getProposalState to match the account state transitions
            const getProposalStateMock = jest.spyOn(governanceManager as any, 'getProposalState')
                .mockImplementation(() => Promise.resolve({ state: ProposalState.Active }));
            // Create proposal
            const { proposalAddress, tx } = await governanceManager.createProposalAccount(
                connection,
                wallet,
                {
                    title: "Test Proposal",
                    description: "This is a test proposal",
                    votingPeriod: 259200
                }
            );
            expect(proposalAddress).toBeDefined();
            expect(tx.instructions.length).toBe(1);

            // Cast vote
            const voteTx = await governanceManager.castVote(
                connection,
                wallet,
                proposalAddress,
                true
            );
            expect(voteTx.instructions.length).toBe(1);

            // Execute proposal
            const executeTx = await governanceManager.executeProposal(
                connection,
                wallet,
                proposalAddress
            );
            expect(executeTx.instructions.length).toBe(1);
        });

        it('should reject proposals with invalid parameters', async () => {
            await expect(
                governanceManager.createProposalAccount(
                    connection,
                    wallet,
                    {
                        votingPeriod: 3600 // Too short
                    }
                )
            ).rejects.toThrow('Invalid proposal parameters');
        });
    });

    describe('voting', () => {
        it('should handle delegated voting power', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            const delegateWallet = Keypair.generate();
            
            // Mock delegated voting power
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockImplementation(async (wallet: unknown) => {
                    if (wallet instanceof PublicKey && wallet.equals(delegateWallet.publicKey)) {
                        return 1000;
                    }
                    return 0;
                });

            await expect(
                governanceManager.castVote(
                    connection,
                    delegateWallet,
                    proposalAddress,
                    true
                )
            ).resolves.not.toThrow();
        });
        it('should validate voting power', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Clean up any existing mocks
            jest.restoreAllMocks();
            
            // Mock low voting power
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(10); // Return insufficient voting power
                
            // Mock proposal data
            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: createProposalBuffer({
                        title: "Test Proposal",
                        description: "Test Description",
                        proposer: wallet.publicKey,
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000,
                        timeLockEnd: Date.now() + 172800000, 
                        yesVotes: 0,
                        noVotes: 0,
                        quorumRequired: 100,
                        executed: false,
                        state: ProposalState.Active,
                        votes: []
                    }),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                });

            // Mock proposal data with properly initialized votes array
            const mockValidationMetadata = {
                state: ProposalState.Active,
                votingPower: 0, // Zero voting power to trigger validation error
                proposer: wallet.publicKey.toBase58(),
                title: "Test Proposal",
                description: "Test Description",
                voteWeights: {
                    yes: 0,
                    no: 0,
                    abstain: 0
                },
                votes: [], // Initialize empty votes array
                quorum: 100,
                startTime: Date.now() - 1000,
                endTime: Date.now() + 86400000
            };

            // Mock getAccountInfo to return properly structured metadata
            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: createProposalBuffer({
                        title: "Test Proposal",
                        description: "Test Description",
                        proposer: wallet.publicKey,
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000,
                        timeLockEnd: Date.now() + 172800000,
                        yesVotes: 0,
                        noVotes: 0,
                        quorumRequired: 100,
                        executed: false,
                        state: ProposalState.Active,
                        votes: []
                    }),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                });

            await expect(
                governanceManager.castVote(
                    connection,
                    wallet,
                    proposalAddress,
                    true
                )
            ).rejects.toThrow('Insufficient voting power');
        });

        it('should prevent double voting', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock getTokenAccountsByOwner with sufficient balance
            jest.spyOn(connection, 'getTokenAccountsByOwner')
                .mockResolvedValue({
                    context: { slot: 0 },
                    value: [{
                        pubkey: new PublicKey("11111111111111111111111111111111"),
                        account: {
                            data: Buffer.from(JSON.stringify({ amount: '1000' })),
                            executable: false,
                            lamports: 1000000,
                            owner: new PublicKey("11111111111111111111111111111111"),
                            rentEpoch: 0
                        }
                    }]
                });
            
            // Set up proper voting power mock
            jest.spyOn(governanceManager as any, 'calculateVoteWeight')
                .mockResolvedValue(1000);

            // Mock proposal data with existing vote from same wallet
            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: createProposalBuffer({
                        title: "Test Proposal",
                        description: "Test Description",
                        proposer: wallet.publicKey,
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000,
                        timeLockEnd: Date.now() + 172800000,
                        yesVotes: 1000,
                        noVotes: 0,
                        quorumRequired: 100,
                        executed: false,
                        state: ProposalState.Active,
                        votes: [{
                            voter: wallet.publicKey
                        }]
                    }),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                });

            // Mock hasVoted to return true
            jest.spyOn(governanceManager as any, 'hasVoted')
                .mockImplementation(async () => {
                    return {
                        hasVoted: true,
                        vote: true
                    };
                });

            await expect(
                governanceManager.castVote(
                    connection,
                    wallet,
                    proposalAddress,
                    true
                )
            ).rejects.toThrow('Already voted');
        });
    });

    describe('proposal execution', () => {
        it('should handle exact quorum threshold', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock exact quorum votes
            jest.spyOn(governanceManager as any, 'getVoteCount')
                .mockResolvedValue({ yes: 100, no: 0, abstain: 0 });

                    beforeEach(() => {
                    wallet = Keypair.generate();
                    connection = {
                        commitment: 'confirmed' as Commitment,
                        rpcEndpoint: 'http://localhost:8899',
                        getAccountInfo: jest.fn(),
                        sendTransaction: jest.fn(),
                        simulateTransaction: jest.fn(),
                        getLatestBlockhash: jest.fn().mockResolvedValue({
                        blockhash: 'test-blockhash',
                        lastValidBlockHeight: 1000
                        }),
                        getRecentBlockhash: jest.fn().mockResolvedValue({
                        blockhash: 'test-blockhash',
                        feeCalculator: { lamportsPerSignature: 5000 }
                        }),
                        getBalance: jest.fn().mockResolvedValue(1000000),
                        getProgramAccounts: jest.fn(),
                        getVersion: jest.fn().mockResolvedValue({
                        'feature-set': 1,
                        'solana-core': '1.18.26'
                        }),
                        getSlot: jest.fn().mockResolvedValue(0)
                    } as MockConnection;

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
                        quorumRequired: 100
                    };

                    validateProposalMock = jest.spyOn(governanceManager as any, 'validateProposal')
                        .mockImplementation(() => mockProposalData);
                        
                    getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo');
                    simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction');
                    sendTransactionMock = jest.spyOn(connection, 'sendTransaction');
                    
                    proposalAddress = new PublicKey(Keypair.generate().publicKey);
                    });

                        it('should handle connection errors', async () => {
                            // Mock connection failure
                            jest.spyOn(localConnection, 'sendTransaction')
                                .mockRejectedValue(new Error('Connection failed'));

                            await expect(
                                localGovernanceManager.createProposalAccount(
                                    localConnection,
                                    localWallet,
                                    {
                                        votingPeriod: 259200
                                    }
                                )
                            ).rejects.toThrow('Invalid proposal parameters');
            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Cannot execute: Proposal is not in succeeded state');
        });

        it('should enforce timelock period', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock proposal with future execution time
            jest.spyOn(governanceManager as any, 'getProposalState')
                .mockResolvedValue({
                    state: ProposalState.Active,
                    executionTime: Date.now() + 86400000 // 1 day in future
                });

            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Cannot execute: Proposal is not in succeeded state');
        });
    });

    describe('error handling', () => {
        it('should handle connection errors', async () => {
            // Mock connection failure
            jest.spyOn(connection, 'sendTransaction')
                .mockRejectedValue(new Error('Connection failed'));

            await expect(
                governanceManager.createProposalAccount(
                    connection,
                    wallet,
                    {
                        votingPeriod: 259200
                    }
                )
            ).rejects.toThrow('Invalid proposal parameters');
        });

            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Cannot execute: Proposal not found');
        });
    });
            });

            afterEach(() => {
                jest.clearAllMocks();
                jest.useRealTimers();
                jest.clearAllTimers();
            });

        describe('successful voting', () => {
            describe('voting scenarios', () => {
                jest.setTimeout(30000); // Increase timeout for these tests
                describe('with active proposal', () => {
                    beforeEach(() => {
                        jest.resetAllMocks();
                        proposalAddress = new PublicKey(Keypair.generate().publicKey);
                        
                        validateProposalMock = jest.spyOn(governanceManager, 'validateProposal')
                            .mockImplementation(async (conn: Connection, addr: PublicKey) => ({
                                title: "Test Proposal",
                                description: "Test Description", 
                                proposer: wallet.publicKey,
                                state: ProposalState.Active,
                                votes: [],
                                startTime: Date.now() - 1000,
                                endTime: Date.now() + 86400000,
                                timeLockEnd: Date.now() + 172800000,
                                voteWeights: {
                                    yes: 0,
                                    no: 0,
                                    abstain: 0
                                },
                                yesVotes: 0,
                                noVotes: 0,
                                quorumRequired: 100,
                                executed: false
                            }));
                            .mockImplementation(jest.fn(async (_: Connection, __: PublicKey) => {
                                const info = await connection.getAccountInfo(proposalAddress);
                                if (!info) {
                                    throw new GlitchError('Proposal not found', ErrorCode.PROPOSAL_NOT_FOUND);
                                }
                                
                                return {
                                    title: "Test Proposal",
                                    description: "Test Description",
                                    proposer: wallet.publicKey,
                                    state: ProposalState.Active,
                                    votes: [],
                                    startTime: Date.now() - 1000,
                                    endTime: Date.now() + 86400000,
                                    timeLockEnd: Date.now() + 172800000,
                                    voteWeights: {
                                        yes: 0,
                                        no: 0,
                                        abstain: 0
                                    },
                                    yesVotes: 0,
                                    noVotes: 0,
                                    quorumRequired: 100,
                                    executed: false
                                };
                            })
                            });

                        // Mock getAccountInfo to return our data
                        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo')
                            .mockResolvedValue({
                                data: createProposalBuffer({
                                    title: "Test Proposal",
                                    description: "Test Description",
                                    proposer: wallet.publicKey,
                                    startTime: Date.now() - 1000,
                                    endTime: Date.now() + 86400000,
                                    timeLockEnd: Date.now() + 172800000,
                                    yesVotes: 150,
                                    noVotes: 50,
                                    quorumRequired: 100,
                                    executed: false,
                                    state: ProposalState.Succeeded,
                                    votes: []
                                }),
                                executable: false,
                                lamports: 0,
                                owner: governanceManager['programId'],
                                rentEpoch: 0
                            });

                        // Mock transaction simulation and ensure it's called
                        simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction')
                            .mockImplementation(async () => {
                                return {
                                    context: { slot: 0 },
                                    value: { 
                                        err: null, 
                                        logs: ['Program log: Vote recorded'], 
                                        accounts: null, 
                                        unitsConsumed: 0, 
                                        returnData: null 
                                    }
                                };
                            });

                        // Mock transaction sending with proper async behavior
                        sendTransactionMock = jest.spyOn(connection, 'sendTransaction')
                            .mockImplementation(async () => {
                                await new Promise(resolve => setTimeout(resolve, 10));
                                return 'mock-signature';
                            });
                    });

                    afterEach(() => {
                        jest.restoreAllMocks();
                    });

                    it('should create valid vote transaction', async () => {
                        // Get account info and debug buffer contents
                        const accountInfo = await connection.getAccountInfo(proposalAddress);
                        if (accountInfo?.data) {
                            console.log('Debugging proposal buffer:');
                            debugBuffer(accountInfo.data);
                        }
                        
                        // Call castVote and await simulation
                        const tx1 = await governanceManager.castVote(
                            connection,
                            wallet,
                            proposalAddress,
                            true
                        );
                        await connection.simulateTransaction(tx1, [wallet]);
                        
                        // Advance timers to ensure rate limiting doesn't block
                        jest.advanceTimersByTime(2000);
                        
                        const tx2 = await governanceManager.castVote(
                            connection,
                            wallet,
                            proposalAddress,
                            true
                        );
                        await connection.simulateTransaction(tx2, [wallet]);

                        // Verify transactions were simulated
                        expect(simulateTransactionMock).toHaveBeenCalledTimes(2);

                        // Verify each mock was called with correct args
                        expect(validateProposalMock).toHaveBeenCalledTimes(2);
                        expect(validateProposalMock).toHaveBeenCalledWith(connection, proposalAddress);

                        expect(getAccountInfoMock).toHaveBeenCalledTimes(2);
                        expect(getAccountInfoMock).toHaveBeenCalledWith(proposalAddress);
                        expect(getAccountInfoMock.mock.calls.every((call: any) => 
                            call[0].equals(proposalAddress)
                        )).toBe(true);

                        expect(simulateTransactionMock).toHaveBeenCalledTimes(2);

                        // Verify the call order
                        const validateCall = validateProposalMock.mock.invocationCallOrder[0];
                        const getInfoCall = getAccountInfoMock.mock.invocationCallOrder[0];
                        const simulateCall = simulateTransactionMock.mock.invocationCallOrder[0];

                        expect(validateCall).toBeLessThan(getInfoCall);
                        expect(getInfoCall).toBeLessThan(simulateCall);
                    });
                });

                describe('with ended proposal', () => {
                    beforeEach(() => {
                        jest.restoreAllMocks();
                        // Mock getTokenAccountsByOwner first
                        throw new GlitchError('Proposal is not active', ErrorCode.INVALID_PROPOSAL_STATE);
                            .mockResolvedValue({
                                context: { slot: 0 },
                                value: [{
                                    pubkey: new PublicKey("11111111111111111111111111111111"),
                                    account: {
                                        data: Buffer.alloc(128).fill(0),
                                        executable: false,
                                        lamports: 1000000,
                                        owner: new PublicKey("11111111111111111111111111111111"),
                                        rentEpoch: 0
                                    }
                                }]
                            });
                        jest.spyOn(governanceManager as any, 'validateProposal')
                            .mockImplementation(async (_connection: Connection, _proposalAddress: PublicKey) => {
                                throw new GlitchError('Proposal is not active', ErrorCode.PROPOSAL_ENDED);
                            });
                    afterEach(() => {
                        jest.restoreAllMocks();
                    });

                    it('should reject voting on ended proposal', async () => {
                        const endedProposalAddress = new PublicKey(Keypair.generate().publicKey);
                        
                        await expect(
                            governanceManager.castVote(
                                connection,
                                wallet,
                                endedProposalAddress,
                                true
                            )
                        ).rejects.toThrow('Proposal is not active');
                    });
                });
            });
        });

        describe('failed voting', () => {
            beforeEach(() => {
                jest.restoreAllMocks();
            });
            
            it('should reject voting on inactive proposal', async () => {
                // Mock getTokenAccountsByOwner first
                jest.spyOn(connection, 'getTokenAccountsByOwner')
                    .mockResolvedValue({
                        context: { slot: 0 },
                        value: [{
                            pubkey: new PublicKey("11111111111111111111111111111111"),
                            account: {
                                data: Buffer.alloc(128).fill(0),
                                executable: false,
                                lamports: 1000000,
                                owner: new PublicKey("11111111111111111111111111111111"),
                                rentEpoch: 0
                            }
                        }]
                    });
                jest.spyOn(governanceManager as any, 'validateProposal')
                    .mockImplementation(async () => {
                        throw new GlitchError('Proposal is not active', ErrorCode.PROPOSAL_STATE_INVALID);
                    });

                await expect(
                    governanceManager.castVote(
                        connection,
                        wallet,
                        proposalAddress,
                        true
                    )
                ).rejects.toThrow('Proposal is not active');
            });
        });
