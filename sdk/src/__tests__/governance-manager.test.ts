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

        it('should create valid vote transaction', async () => {
            console.log('[Test] Setting up mocks...');
            
            const proposalAddress = Keypair.generate().publicKey;
            jest.useFakeTimers();
            jest.setSystemTime(1641024000000); // Fixed timestamp
            const mockProposalData = {
                title: "Test",
                description: "Test",
                proposer: Keypair.generate().publicKey,
                startTime: Date.now() - 1000, // 1 second ago
                endTime: Date.now() + 86400000, // 24 hours from now
                executionTime: Date.now() + 172800000, // 48 hours from now
                voteWeights: { yes: 0, no: 0, abstain: 0 },
                votes: [],
                quorum: 100,
                executed: false
            };

            // Set up all mocks with immediate responses
            const mocks = {
                validateProposal: jest.spyOn(governanceManager, 'validateProposal')
                    .mockResolvedValue(mockProposalData),
                getProposalState: jest.spyOn(governanceManager, 'getProposalState')
                    .mockResolvedValue(ProposalState.Active),
                getAccountInfo: jest.spyOn(connection, 'getAccountInfo')
                    .mockResolvedValue(null),
                sendTransaction: jest.spyOn(connection, 'sendTransaction')
                    .mockResolvedValue('mock-signature'),
                simulateTransaction: jest.spyOn(connection, 'simulateTransaction')
                    .mockResolvedValue({
                        context: { slot: 0 },
                        value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
                    }),
                confirmTransaction: jest.spyOn(connection, 'confirmTransaction')
                    .mockResolvedValue({
                        context: { slot: 0 },
                        value: { err: null }
                    })
            };
            
            console.log('[Test] Mocks configured');

            try {
                console.log('[Test] About to call castVote...');
                
                const transaction = await governanceManager.castVote(
                    connection,
                    wallet,
                    proposalAddress,
                    true
                );
                
                console.log('[Test] castVote returned successfully');
                expect(transaction).toBeDefined();
                expect(transaction.instructions.length).toBe(1);
                expect(transaction.instructions[0].data[0]).toBe(0x01); // Vote instruction
            } catch (error) {
                console.error('[Test] Error in castVote:', error);
                throw error;
            }

            // Verify all mocks were called
            Object.entries(mocks).forEach(([name, mock]) => {
                expect(mock).toHaveBeenCalled();
                console.log(`[Mock] ${name} was called ${mock.mock.calls.length} times`);
            });
            
            expect(transaction.instructions.length).toBe(1);
            expect(transaction.instructions[0].data[0]).toBe(0x01); // Vote instruction
            
            console.log('Test completed successfully');

            // Clean up
            Object.values(mocks).forEach(mock => mock.mockRestore());
        });

        it('should reject voting on inactive proposals', async () => {
            const proposalAddress = Keypair.generate().publicKey;
            
            // Mock validateProposal to throw
            jest.spyOn(governanceManager, 'validateProposal')
                .mockRejectedValue(new GlitchError('Proposal voting has ended', 2006));
            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValue(ProposalState.Executed);

            await expect(
                governanceManager.castVote(
                    connection,
                    wallet,
                    proposalAddress,
                    true
                )
            ).rejects.toThrow('Proposal voting has ended');
        });
    });
});
