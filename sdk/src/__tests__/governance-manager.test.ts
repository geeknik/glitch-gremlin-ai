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
            describe('voting scenarios', () => {
                describe('with active proposal', () => {
                    let validateProposalMock: jest.SpyInstance;
                    let getAccountInfoMock: jest.SpyInstance;
                    let simulateTransactionMock: jest.SpyInstance;
                    let sendTransactionMock: jest.SpyInstance;
                    let proposalAddress: PublicKey;
            
                    beforeEach(() => {
                        jest.resetAllMocks();
                        proposalAddress = new PublicKey(Keypair.generate().publicKey);
                        
                        // Mock active proposal data
                        // Create consistent proposal data
                        const mockProposalData = {
                            title: "Test Proposal",
                            description: "Test Description",
                            proposer: wallet.publicKey,
                            startTime: Date.now() - 1000,
                            endTime: Date.now() + 86400000,
                            executionTime: Date.now() + 172800000,
                            voteWeights: { yes: 0, no: 0, abstain: 0 },
                            votes: [],
                            quorum: 100,
                            executed: false,
                            status: 'active'
                        };

                        // Mock validateProposal first
                        validateProposalMock = jest.spyOn(governanceManager, 'validateProposal')
                            .mockResolvedValueOnce(mockProposalData);

                        // Create account info with the same data
                        const mockAccountInfo = {
                            data: Buffer.from(JSON.stringify(mockProposalData)),
                            executable: false,
                            lamports: 1000000,
                            owner: governanceManager['programId'],
                            rentEpoch: 0
                        };

                        // Mock getAccountInfo to return our data
                        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo')
                            .mockResolvedValueOnce(mockAccountInfo);

                        // Ensure clean mock state
                        jest.clearAllMocks();

                        // Mock transaction simulation
                        simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction')
                            .mockResolvedValueOnce({
                                context: { slot: 0 },
                                value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
                            });

                        // Mock transaction sending
                        sendTransactionMock = jest.spyOn(connection, 'sendTransaction')
                            .mockResolvedValueOnce('mock-signature');
                    });

                    afterEach(() => {
                        jest.restoreAllMocks();
                    });

                    it('should create valid vote transaction', async () => {
                        // Call castVote and await the result
                        const transaction = await governanceManager.castVote(
                            connection,
                            wallet,
                            proposalAddress,
                            true
                        );

                        // Verify the transaction was created
                        expect(transaction).toBeDefined();
                        
                        // Verify validateProposal was called with correct args
                        expect(validateProposalMock).toHaveBeenCalledWith(
                            connection,
                            proposalAddress
                        );
                        
                        // Call castVote and await the result
                        const transaction = await governanceManager.castVote(
                            connection,
                            wallet,
                            proposalAddress,
                            true
                        );

                        // Verify the transaction was created
                        expect(transaction2).toBeDefined();

                        // Verify each mock was called exactly once with correct args
                        expect(validateProposalMock).toHaveBeenCalledTimes(2);
                        expect(validateProposalMock).toHaveBeenCalledWith(connection, proposalAddress);

                        expect(getAccountInfoMock).toHaveBeenCalledTimes(1);
                        expect(getAccountInfoMock).toHaveBeenCalledWith(proposalAddress);

                        expect(simulateTransactionMock).toHaveBeenCalledTimes(1);

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
                        jest.spyOn(governanceManager, 'validateProposal')
                            .mockRejectedValue(new GlitchError('Proposal voting has ended', 2006));
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

            it('should reject voting on inactive proposals', async () => {
                const proposalAddress = Keypair.generate().publicKey;
                
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
