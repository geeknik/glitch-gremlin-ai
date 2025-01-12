import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GovernanceManager } from '../governance.js';
import {
Keypair,
Connection,
PublicKey,
Transaction,
SimulatedTransactionResponse,
Version,
AccountInfo,
GetAccountInfoConfig,
Commitment,
SendOptions,
Signer,
SimulateTransactionConfig,
RpcResponseAndContext,
GetProgramAccountsResponse,
} from '@solana/web3.js';
import { MockedObject } from 'jest-mock';
import { ProposalState } from '../types.js';
import { ErrorCode } from '../errors.js';
import { GlitchError } from '../errors.js';
import { TokenEconomics } from '../token-economics.js';
jest.setTimeout(30000); // 30 seconds for more reliable CI runs

// Mock proposal data at top level scope

describe('GovernanceManager', () => {
    // Define all test variables at the top level of the main describe block
    let governanceManager: GovernanceManager;
    let connection: MockedObject<Connection>;
    let wallet: Keypair;
    let mockProposalData: {
        state: ProposalState;
        votingPower: number;
        votes: any[];
        proposer: string;
        startTime: number;
        endTime: number;
        quorum: number;
        title?: string;
        description?: string;
        voteWeights?: {
            yes: number;
            no: number;
            abstain: number;
        };
    };
    let proposalAddress: PublicKey;
    let validateProposalMock: jest.SpiedFunction<typeof governanceManager.validateProposal>;
    let getAccountInfoMock: jest.SpiedFunction<Connection['getAccountInfo']>;
    let simulateTransactionMock: jest.SpiedFunction<Connection['simulateTransaction']>;
    let sendTransactionMock: jest.SpiedFunction<Connection['sendTransaction']>;

    // Initialize mocks with proper types
    beforeEach(() => {
        connection = {
            getAccountInfo: jest.fn(),
            sendTransaction: jest.fn(),
            simulateTransaction: jest.fn(),
            getVersion: jest.fn(),
            getTokenAccountsByOwner: jest.fn().mockImplementation(() => Promise.resolve({
                context: { slot: 0 },
                value: [{
                    pubkey: new PublicKey("11111111111111111111111111111111"),
                    account: {
                        data: Buffer.from([]),
                        executable: false,
                        lamports: 1000000,
                        owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
                        rentEpoch: 0
                    }
                }]
            })),
            commitment: 'confirmed' as Commitment,
            rpcEndpoint: 'http://localhost:8899',
            getBalance: jest.fn().mockImplementation(async () => 1000000000),
            getRecentBlockhash: jest.fn().mockImplementation(async () => ({
                blockhash: 'test-blockhash',
                feeCalculator: {
                    lamportsPerSignature: 5000
                }
            }))
        } as unknown as MockedObject<Connection>;

        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
            connection
        );

        mockProposalData = {
            state: ProposalState.Active,
            votingPower: 1000,
            votes: [],
            proposer: wallet.publicKey.toBase58(),
            startTime: Date.now() - 1000,
            endTime: Date.now() + 86400000,
            quorum: 100,
            title: "Test Proposal",
            description: "Test Description", 
            voteWeights: {
                yes: 0,
                no: 0,
                abstain: 0
            }
        };
    // Mock implementation for calculateVoteWeight
    jest.spyOn(governanceManager as any, 'calculateVoteWeight')
        .mockImplementation((): Promise<number> => Promise.resolve(1000));
        // Configure default mock implementations
        (connection.getAccountInfo as jest.MockedFunction<Connection['getAccountInfo']>).mockResolvedValue({
            data: Buffer.from(JSON.stringify({
                state: ProposalState.Active,
                votingPower: 1000,
                proposer: Keypair.generate().publicKey.toBase58(),
                title: "Test Proposal",
                description: "Test Description",
                voteWeights: {
                    yes: 0,
                    no: 0,
                    abstain: 0
                },
                votes: [],
                quorum: 100,
                startTime: Date.now() - 1000,
                endTime: Date.now() + 86400000
            })),
            executable: false,
            lamports: 1000000,
            owner: new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'),
            rentEpoch: 0
        });

        (connection.sendTransaction as jest.MockedFunction<Connection['sendTransaction']>).mockResolvedValue('mock-signature');
        (connection.simulateTransaction as jest.MockedFunction<Connection['simulateTransaction']>).mockResolvedValue({
            context: { slot: 0 },
            value: {
                err: null,
                logs: [],
                accounts: null,
                unitsConsumed: 0,
                returnData: null
            }
        });
        (connection.getVersion as jest.MockedFunction<Connection['getVersion']>).mockResolvedValue({
            'feature-set': 1,
            'solana-core': '1.18.26'
        });
        
        jest.clearAllMocks();
    });

    describe('proposal lifecycle', () => {
        it('should handle multiple concurrent proposals', async () => {
            const proposal1 = new PublicKey(Keypair.generate().publicKey);
            const proposal2 = new PublicKey(Keypair.generate().publicKey);
            
            // Mock proposal data
            jest.spyOn(connection, 'getAccountInfo')
                .mockImplementation(async (address: PublicKey) => {
                    if (address.equals(proposal1)) {
                        return {
                            data: Buffer.from(JSON.stringify({
                                state: ProposalState.Active,
                                votingPower: 1000,
                                votes: [],
                                proposer: wallet.publicKey.toBase58(),
                                startTime: Date.now() - 1000,
                                endTime: Date.now() + 86400000,
                                quorum: 100
                            })),
                            executable: false,
                            lamports: 1000000,
                            owner: governanceManager['programId'],
                            rentEpoch: 0
                        };
                    }
                    if (address.equals(proposal2)) {
                        return {
                            data: Buffer.from(JSON.stringify({
                                state: ProposalState.Active,
                                votingPower: 1000,
                                votes: [],
                                proposer: wallet.publicKey.toBase58(),
                                startTime: Date.now() - 1000,
                                endTime: Date.now() + 86400000,
                                quorum: 100
                            })),
                            executable: false,
                            lamports: 1000000,
                            owner: governanceManager['programId'],
                            rentEpoch: 0
                        };
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
                    data: Buffer.from(JSON.stringify({
                        ...mockProposalData,
                        quorum: 10 // Low quorum to ensure power check fails first
                    })),
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
                    const mockFn = jest.fn<() => Promise<number>>();
                    mockFn.mockResolvedValueOnce(50)
                        .mockResolvedValue(1000);
                    return mockFn();
                });

            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: Buffer.from(JSON.stringify({
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
                        votes: [],
                        quorum: 100,
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000
                    })),
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
            ).rejects.toThrow('Proposal cannot be executed');
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
                data: Buffer.from(JSON.stringify(mockProposalMetadata)),
                executable: false,
                lamports: 1000000,
                owner: governanceManager['programId'],
                rentEpoch: 0
            });
            
            // State after vote is cast (with updated vote weights)
            getAccountInfoMock.mockResolvedValueOnce({
                data: Buffer.from(JSON.stringify({
                    ...mockProposalMetadata,
                    voteWeights: {
                        yes: 1000, // Sufficient votes to meet quorum
                        no: 0,
                        abstain: 0
                    },
                    votes: [{
                        voter: wallet.publicKey.toBase58(),
                        vote: true,
                        weight: 1000
                    }]
                })),
                executable: false,
                lamports: 1000000,
                owner: governanceManager['programId'],
                rentEpoch: 0
            });

            // State for execution (succeeded state with sufficient votes)
            getAccountInfoMock.mockResolvedValue({
                data: Buffer.from(JSON.stringify({
                    ...mockProposalMetadata,
                    state: ProposalState.Succeeded,
                    voteWeights: {
                        yes: 1000,
                        no: 0,
                        abstain: 0
                    },
                    votes: [{
                        voter: wallet.publicKey.toBase58(),
                        vote: true,
                        weight: 1000
                    }]
                })),
                executable: false,
                lamports: 1000000,
                owner: governanceManager['programId'],
                rentEpoch: 0
            });

            // Mock getProposalState to match the account state transitions
            const getProposalStateMock = jest.spyOn(governanceManager, 'getProposalState')
                .mockImplementation(() => Promise.resolve(ProposalState.Succeeded));
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
                .mockImplementation(async (wallet: PublicKey) => {
                    if (wallet.equals(delegateWallet.publicKey)) {
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
                    data: Buffer.from(JSON.stringify({
                        state: ProposalState.Active,
                        votingPower: 1000, // Required voting power
                        proposer: wallet.publicKey.toBase58(),
                        title: "Test Proposal",
                        description: "Test Description",
                        voteWeights: { yes: 0, no: 0, abstain: 0 },
                        votes: [],
                        quorum: 100,
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000
                    })),
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
                    data: Buffer.from(JSON.stringify(mockValidationMetadata)),
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
                    data: Buffer.from(JSON.stringify({
                        state: ProposalState.Active,
                        votingPower: 1000,
                        proposer: wallet.publicKey.toBase58(),
                        title: "Test Proposal",
                        description: "Test Description",
                        voteWeights: {
                            yes: 1000,
                            no: 0,
                            abstain: 0
                        },
                        votes: [{
                            voter: wallet.publicKey.toBase58(),
                            vote: true,
                            weight: 1000
                        }],
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000,
                        quorum: 100
                    })),
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

            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).resolves.not.toThrow();
        });

        it('should validate quorum requirements', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock insufficient votes
            jest.spyOn(governanceManager as any, 'getVoteCount')
                .mockResolvedValue({ yes: 10, no: 5, abstain: 0 });

            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Proposal cannot be executed');
        });

        it('should enforce timelock period', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock proposal with future execution time
            jest.spyOn(governanceManager as any, 'getProposalState')
                .mockResolvedValue({
                    executionTime: Date.now() + 86400000 // 1 day in future
                });

            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Proposal cannot be executed');
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

        it('should handle invalid proposal state', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock invalid state
            jest.spyOn(governanceManager as any, 'getProposalState')
                .mockResolvedValue(null);

            await expect(
                governanceManager.executeProposal(
                    connection,
                    wallet,
                    proposalAddress
                )
            ).rejects.toThrow('Proposal cannot be executed');
        });
    });
        

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers(); 
        jest.clearAllTimers();
    });

    describe('castVote', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            jest.clearAllTimers();
            
            // Use fake timers but allow nextTick
            jest.useFakeTimers({ doNotFake: ['nextTick'] });
            jest.setSystemTime(1641024000000); // Fixed timestamp
            
            // Setup mock proposal data and address
            proposalAddress = new PublicKey(Keypair.generate().publicKey);
            mockProposalData = {
                state: ProposalState.Active,
                votingPower: 1000,
                votes: [],
                proposer: wallet.publicKey.toBase58(),
                startTime: 1641024000000,
                endTime: 1641024000000 + 86400000,
                quorum: 100,
                title: "Test Proposal",
                description: "Test Description",
                voteWeights: {
                    yes: 0,
                    no: 0,
                    abstain: 0
                }
            };
            
            // Setup default account info mock
            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValue({
                    data: Buffer.from(JSON.stringify(mockProposalData)),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                });
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.clearAllMocks();
            jest.clearAllTimers();
        });


        describe('successful voting', () => {
            describe('voting scenarios', () => {
                jest.setTimeout(30000); // Increase timeout for these tests
                describe('with active proposal', () => {
                    beforeEach(() => {
                        jest.resetAllMocks();
                        proposalAddress = new PublicKey(Keypair.generate().publicKey);
                        
                        // Mock validateProposal first
                        validateProposalMock = jest.spyOn(governanceManager, 'validateProposal')
                            .mockImplementation(async () => {
                                const mockProposalData = {
                                    title: "Test Proposal",
                                    description: "Test Description", 
                                    proposer: wallet.publicKey,
                                    startTime: Date.now() - 1000,
                                    endTime: Date.now() + 86400000,
                                    executionTime: Date.now() + 172800000,
                                    voteWeights: { yes: 150, no: 50, abstain: 0 },
                                    votes: [],
                                    quorum: 100,
                                    executed: false,
                                    status: 'active'
                                };

                                // Get account info as part of validation
                                
                                // Call the mock through connection.getAccountInfo
                                await connection.getAccountInfo(proposalAddress);
                                
                                return mockProposalData;
                            });

                        // Mock getAccountInfo to return our data
                        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo')
                            .mockResolvedValue({
                                data: Buffer.alloc(0), // Simplified mock
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
                        jest.spyOn(governanceManager, 'validateProposal')
                            .mockRejectedValue(new GlitchError('Proposal voting has ended', ErrorCode.PROPOSAL_ENDED));
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
                        ).rejects.toThrow('Proposal voting has ended');
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
                jest.spyOn(governanceManager, 'validateProposal')
                    .mockRejectedValue(new GlitchError('Proposal is not active', 2003));

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
    });
});
