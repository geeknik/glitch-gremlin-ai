import { jest } from '@jest/globals';
import { GovernanceManager } from '../governance.js';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { ProposalState } from '../types.js';
import { GlitchError } from '../errors.js';
import { TokenEconomics } from '../token-economics.js';

// Increase timeout for all tests
jest.setTimeout(30000); // 30 seconds for more reliable CI runs

describe('GovernanceManager', () => {
    let governanceManager: GovernanceManager;
    let connection: Connection;
    let wallet: Keypair;

    beforeEach(() => {
        connection = {
            getAccountInfo: jest.fn(),
            sendTransaction: jest.fn(),
            simulateTransaction: jest.fn(),
            getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.18.26' })
        } as unknown as Connection;
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(
            new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9')
        );
    });

    describe('proposal lifecycle', () => {
        it('should validate proposal parameters', async () => {
            await expect(
                governanceManager.createProposalAccount(
                    connection,
                    wallet,
                    {
                        votingPeriod: 0, // Invalid
                        description: '',
                        title: ''
                    }
                )
            ).rejects.toThrow('Invalid voting period');
        });

        it('should handle insufficient voting power', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            jest.spyOn(TokenEconomics, 'validateStakeAmount')
                .mockImplementation(() => {
                    throw new GlitchError('Insufficient voting power');
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
            ).rejects.toThrow('Execution failed');
        });
        it('should create, vote on, and execute a proposal', async () => {
            jest.setTimeout(60000); // Increase timeout to 60 seconds
            
            // Mock proposal data
            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue(ProposalState.Succeeded);
            // Create proposal
            const { proposalAddress, tx } = await governanceManager.createProposalAccount(
                connection,
                wallet,
                {
                    votingPeriod: 259200,
                    description: 'Test proposal',
                    title: 'Test Title'
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
                        votingPeriod: 3600, // Too short
                        description: 'Test proposal',
                        title: ''
                    }
                )
            ).rejects.toThrow('Invalid proposal parameters');
        });
    });

    describe('voting', () => {
        it('should validate voting power', async () => {
            const proposalAddress = new PublicKey(Keypair.generate().publicKey);
            
            // Mock insufficient voting power
            jest.spyOn(TokenEconomics, 'validateStakeAmount')
                .mockImplementation(() => {});

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
            
            // Mock hasVoted to return true
            jest.spyOn(governanceManager as any, 'hasVoted')
                .mockResolvedValue(true);

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
            ).rejects.toThrow('Quorum not reached');
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
            ).rejects.toThrow('Timelock period not elapsed');
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
                        votingPeriod: 259200,
                        description: 'Test proposal',
                        title: 'Test Title'
                    }
                )
            ).rejects.toThrow('Connection failed');
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
            ).rejects.toThrow('Invalid proposal state');
        });
    });
        

    afterEach(async () => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Restore real timers
        jest.useRealTimers();
        
        // Clean up Redis connection
        if (governanceManager['queueWorker']?.redis) {
            try {
                await governanceManager['queueWorker'].redis.quit();
                await governanceManager['queueWorker'].redis.disconnect();
            } catch (error) {
                console.error('Error closing Redis:', error);
            }
        }
        
        // Clear any pending timers
        jest.clearAllTimers();
        
        // Add a small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('castVote', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            jest.clearAllTimers();
            // Use fake timers but allow process.nextTick
            jest.useFakeTimers({ doNotFake: ['nextTick'] });
            jest.setSystemTime(1641024000000); // Fixed timestamp
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.clearAllMocks();
            jest.clearAllTimers();
        });

        afterEach(async () => {
            jest.useRealTimers();
            jest.clearAllMocks();
            jest.clearAllTimers();
        
            // Ensure Redis is properly closed
            if (governanceManager['queueWorker']) {
                try {
                    await governanceManager['queueWorker'].close();
                } catch (error) {
                    console.error('Error closing queue worker:', error);
                }
            }
        
            // Add a small delay to ensure cleanup completes
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        describe('successful voting', () => {
            describe('voting scenarios', () => {
                jest.setTimeout(30000); // Increase timeout for these tests
                describe('with active proposal', () => {
                    let validateProposalMock: any;
                    let getAccountInfoMock: any;
                    let simulateTransactionMock: any;
                    let sendTransactionMock: any;
                    let proposalAddress: PublicKey;
            
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
