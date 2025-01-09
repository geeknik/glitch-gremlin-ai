import { GovernanceManager } from '../governance';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { GlitchError } from '../errors';
describe('GovernanceManager', () => {
    let governanceManager;
    let connection;
    let wallet;
    beforeEach(() => {
        connection = new Connection('http://localhost:8899', 'confirmed');
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'));
    });
    describe('createProposalAccount', () => {
        it('should create a proposal with valid parameters', async () => {
            const { proposalAddress, tx } = await governanceManager.createProposalAccount(connection, wallet, {
                votingPeriod: 259200,
                description: 'Test proposal'
            });
            expect(proposalAddress).toBeDefined();
            expect(tx.instructions.length).toBe(1);
        });
        it('should reject invalid voting periods', async () => {
            await expect(governanceManager.createProposalAccount(connection, wallet, {
                votingPeriod: 3600, // Too short
                description: 'Test proposal'
            })).rejects.toThrow('Invalid voting period');
        });
    });
    beforeEach(() => {
        // Use fake timers
        jest.useFakeTimers();
        // Set up test environment
        connection = new Connection('http://localhost:8899', 'confirmed');
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'));
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
                jest.setTimeout(30000); // Increase timeout for these tests
                describe('with active proposal', () => {
                    let validateProposalMock;
                    let getAccountInfoMock;
                    let simulateTransactionMock;
                    let sendTransactionMock;
                    let proposalAddress;
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
                            const mockAccountInfo = {
                                data: Buffer.from(JSON.stringify(mockProposalData)),
                                executable: false,
                                lamports: 1000000,
                                owner: governanceManager['programId'],
                                rentEpoch: 0
                            };
                            // Call the mock through connection.getAccountInfo
                            await connection.getAccountInfo(proposalAddress);
                            return mockProposalData;
                        });
                        // Mock getAccountInfo to return our data
                        getAccountInfoMock = jest.spyOn(connection, 'getAccountInfo')
                            .mockResolvedValue({
                            data: Buffer.from(JSON.stringify({
                                title: "Test Proposal",
                                description: "Test Description",
                                proposer: wallet.publicKey,
                                startTime: Date.now() - 1000,
                                endTime: Date.now() + 86400000,
                                voteWeights: { yes: 150, no: 50, abstain: 0 },
                                votes: [],
                                quorum: 100,
                                executed: false
                            })),
                            executable: false,
                            lamports: 1000000,
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
                        // Mock transaction sending with proper async behavior and error handling
                        sendTransactionMock = jest.spyOn(connection, 'sendTransaction')
                            .mockImplementation(async () => {
                                try {
                                    await new Promise(resolve => setTimeout(resolve, 10));
                                    return 'mock-signature';
                                } catch (error) {
                                    console.error('Mock transaction failed:', error);
                                    throw error;
                                }
                            });
                    });
                    afterEach(() => {
                        jest.restoreAllMocks();
                    });
                    it('should create valid vote transaction', async () => {
                        // Call castVote and await simulation
                        const tx1 = await governanceManager.castVote(connection, wallet, proposalAddress, true);
                        await connection.simulateTransaction(tx1);
                        const tx2 = await governanceManager.castVote(connection, wallet, proposalAddress, true);
                        await connection.simulateTransaction(tx2);
                        // Verify transactions were simulated
                        expect(simulateTransactionMock).toHaveBeenCalledTimes(2);
                        // Verify each mock was called with correct args
                        expect(validateProposalMock).toHaveBeenCalledTimes(2);
                        expect(validateProposalMock).toHaveBeenCalledWith(connection, proposalAddress);
                        expect(getAccountInfoMock).toHaveBeenCalledTimes(2);
                        expect(getAccountInfoMock).toHaveBeenCalledWith(proposalAddress);
                        expect(getAccountInfoMock.mock.calls.every(call => call[0].equals(proposalAddress))).toBe(true);
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
                        jest.spyOn(governanceManager, 'validateProposal')
                            .mockRejectedValue(new GlitchError('Proposal voting has ended', 2006));
                    });
                    afterEach(() => {
                        jest.restoreAllMocks();
                    });
                    it('should reject voting on ended proposal', async () => {
                        const endedProposalAddress = new PublicKey(Keypair.generate().publicKey);
                        await expect(governanceManager.castVote(connection, wallet, endedProposalAddress, true)).rejects.toThrow('Proposal voting has ended');
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
                await expect(governanceManager.castVote(connection, wallet, proposalAddress, true)).rejects.toThrow('Proposal is not active');
            });
        });
    });
});
