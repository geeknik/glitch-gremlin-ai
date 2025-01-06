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
            jest.spyOn(Date, 'now')
                .mockImplementation(() => 1641024000000); // Fixed timestamp
        });
        
        it('should create valid vote transaction', async () => {
            console.log('Test started: castVote');
            
            // Mock current time
            const now = 1641024000000; // Fixed timestamp
            jest.spyOn(Date, 'now').mockImplementation(() => now);
            
            const proposalAddress = Keypair.generate().publicKey;
            const mockProposalData = {
                title: "Test",
                description: "Test",
                proposer: Keypair.generate().publicKey,
                startTime: now - 1000,
                endTime: now + 1000,
                executionTime: now + 86400000,
                voteWeights: { yes: 0, no: 0, abstain: 0 },
                votes: [],
                quorum: 100,
                executed: false
            };

            // Set up all mocks before any calls
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
                    })
            };

            console.log('About to call castVote...');
            
            const tx = await governanceManager.castVote(
                connection,
                wallet,
                proposalAddress,
                true
            );
            
            console.log('castVote returned');

            // Verify all mocks were called
            Object.entries(mocks).forEach(([name, mock]) => {
                expect(mock).toHaveBeenCalled();
                console.log(`[Mock] ${name} was called ${mock.mock.calls.length} times`);
            });
            
            expect(tx.instructions.length).toBe(1);
            expect(tx.instructions[0].data[0]).toBe(0x01); // Vote instruction
            
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
