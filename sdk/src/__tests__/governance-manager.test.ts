import { GovernanceManager } from '../governance';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { ProposalState } from '../types';
import { GlitchError } from '../errors';

describe('GovernanceManager', () => {
    let governanceManager: GovernanceManager;
    let connection: Connection;
    let wallet: Keypair;

    beforeEach(() => {
        connection = new Connection('http://localhost:8899', 'confirmed');
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
        );
    });

    describe('createProposalAccount', () => {
        it('should create a proposal with valid parameters', async () => {
            const { proposalAddress, tx } = await governanceManager.createProposalAccount(
                connection,
                wallet,
                {
                    votingPeriod: 259200,
                    description: 'Test proposal'
                }
            );
            expect(proposalAddress).toBeDefined();
            expect(tx.instructions.length).toBe(1);
        });

        it('should reject invalid voting periods', async () => {
            await expect(
                governanceManager.createProposalAccount(
                    connection,
                    wallet,
                    {
                        votingPeriod: 3600, // Too short
                        description: 'Test proposal'
                    }
                )
            ).rejects.toThrow('Invalid voting period');
        });
    });

    beforeEach(() => {
        // Use fake timers
        jest.useFakeTimers();
        
        // Set up test environment
        connection = new Connection('http://localhost:8899', 'confirmed');
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('castVote', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            // Use fake timers
            jest.useFakeTimers();
            jest.setSystemTime(1641024000000); // Fixed timestamp
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        describe('successful voting', () => {
            it('should create valid vote transaction', async () => {
                const proposalAddress = Keypair.generate().publicKey;
                const mockProposalData = {
                    title: "Test",
                    description: "Test",
                    proposer: Keypair.generate().publicKey,
                    startTime: Date.now() - 1000,
                    endTime: Date.now() + 86400000,
                    executionTime: Date.now() + 172800000,
                    voteWeights: { yes: 0, no: 0, abstain: 0 },
                    votes: [],
                    quorum: 100,
                    executed: false
                };

                // Set up mocks for successful voting
                const validateProposalMock = jest.spyOn(governanceManager, 'validateProposal')
                    .mockResolvedValueOnce(mockProposalData);

                // Mock the account info that validateProposal will fetch
                const mockAccountInfo = {
                    data: Buffer.from(JSON.stringify({
                        title: "Test",
                        description: "Test",
                        proposer: wallet.publicKey.toString(),
                        startTime: Date.now() - 1000,
                        endTime: Date.now() + 86400000,
                        executionTime: Date.now() + 172800000,
                        voteWeights: { yes: 0, no: 0, abstain: 0 },
                        votes: [],
                        quorum: 100,
                        executed: false
                    })),
                    executable: false,
                    lamports: 1000000,
                    owner: governanceManager['programId'],
                    rentEpoch: 0
                };

                const getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo')
                    .mockResolvedValueOnce(mockAccountInfo);

                const simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction')
                    .mockResolvedValueOnce({
                        context: { slot: 0 },
                        value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
                    });

                const sendTransactionMock = jest.spyOn(connection, 'sendTransaction')
                    .mockResolvedValueOnce('mock-signature');

                const transaction = await governanceManager.castVote(
                    connection,
                    wallet,
                    proposalAddress,
                    true
                );

                expect(transaction).toBeDefined();
                expect(transaction.instructions.length).toBe(1);
                expect(transaction.instructions[0].data[0]).toBe(0x01);

                // Verify each mock was called exactly once
                expect(validateProposalMock).toHaveBeenCalledTimes(1);
                expect(getAccountInfoMock).toHaveBeenCalledTimes(1);
                expect(sendTransactionMock).toHaveBeenCalledTimes(1);
                expect(simulateTransactionMock).toHaveBeenCalledTimes(1);

                // Clean up
                validateProposalMock.mockRestore();
                getAccountInfoMock.mockRestore();
                sendTransactionMock.mockRestore();
                simulateTransactionMock.mockRestore();
            });
        });

        describe('failed voting', () => {
            it('should reject voting on inactive proposals', async () => {
                const proposalAddress = Keypair.generate().publicKey;
            
                // Mock for inactive proposal
                const validateProposalMock = jest.spyOn(governanceManager, 'validateProposal')
                    .mockRejectedValueOnce(new GlitchError('Proposal voting has ended', 2006));
            
                const sendTransactionMock = jest.spyOn(connection, 'sendTransaction');
                const simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction');

                // Ensure transaction methods are not called for inactive proposal
                jest.spyOn(connection, 'getAccountInfo').mockImplementation(() => {
                    throw new Error('Should not fetch account info for inactive proposal');
                });

                await expect(
                    governanceManager.castVote(
                        connection,
                        wallet,
                        proposalAddress,
                        true
                    )
                ).rejects.toThrow('Proposal voting has ended');

                // Verify transaction methods were not called
                expect(sendTransactionMock).not.toHaveBeenCalled();
                expect(simulateTransactionMock).not.toHaveBeenCalled();

                // Clean up
                validateProposalMock.mockRestore();
                sendTransactionMock.mockRestore();
                simulateTransactionMock.mockRestore();
            });
        });
    });
});
