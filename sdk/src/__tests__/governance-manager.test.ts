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
            // Reset all mocks before each test
            jest.clearAllMocks();
            
            // Mock current time
            jest.spyOn(Date, 'now')
                .mockImplementation(() => 1641024000000); // Fixed timestamp
        });
        
        it('should create valid vote transaction', async () => {
            const proposalAddress = Keypair.generate().publicKey;
            const mockProposalData = {
                title: "Test",
                description: "Test",
                proposer: Keypair.generate().publicKey,
                startTime: Date.now() - 1000,
                endTime: Date.now() + 1000,
                executionTime: Date.now() + 86400000,
                voteWeights: { yes: 0, no: 0, abstain: 0 },
                votes: [],
                quorum: 100,
                executed: false
            };

            // Mock all async operations
            jest.spyOn(governanceManager, 'validateProposal')
                .mockResolvedValueOnce(mockProposalData);
            
            jest.spyOn(governanceManager, 'getProposalState')
                .mockResolvedValueOnce(ProposalState.Active);

            jest.spyOn(connection, 'getAccountInfo')
                .mockResolvedValueOnce(null);

            jest.spyOn(connection, 'sendTransaction')
                .mockResolvedValueOnce('mock-signature');

            const tx = await governanceManager.castVote(
                connection,
                wallet,
                proposalAddress,
                true
            );
            
            expect(tx.instructions.length).toBe(1);
            expect(tx.instructions[0].data[0]).toBe(0x01); // Vote instruction
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
