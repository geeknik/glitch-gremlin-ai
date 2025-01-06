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
            const now = Date.now();
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

            // Mock all async operations with mockImplementationOnce for better tracking
            const validateProposalSpy = jest.spyOn(governanceManager, 'validateProposal')
                .mockImplementationOnce(async () => {
                    console.log('[Mock] validateProposal called');
                    return mockProposalData;
                });
            
            const getProposalStateSpy = jest.spyOn(governanceManager, 'getProposalState')
                .mockImplementationOnce(async () => {
                    console.log('[Mock] getProposalState called');
                    return ProposalState.Active;
                });

            const getAccountInfoSpy = jest.spyOn(connection, 'getAccountInfo')
                .mockImplementationOnce(async () => {
                    console.log('[Mock] getAccountInfo called');
                    return null;
                });

            const sendTransactionSpy = jest.spyOn(connection, 'sendTransaction')
                .mockImplementationOnce(async () => {
                    console.log('[Mock] sendTransaction called');
                    return 'mock-signature';
                });

            console.log('About to call castVote...');

            const tx = await governanceManager.castVote(
                connection,
                wallet,
                proposalAddress,
                true
            );
            
            console.log('castVote returned');

            // Verify all mocks were called
            expect(validateProposalSpy).toHaveBeenCalledTimes(1);
            expect(getProposalStateSpy).toHaveBeenCalledTimes(1);
            expect(getAccountInfoSpy).toHaveBeenCalledTimes(1);
            expect(sendTransactionSpy).toHaveBeenCalledTimes(1);
            
            expect(tx.instructions.length).toBe(1);
            expect(tx.instructions[0].data[0]).toBe(0x01); // Vote instruction
            
            console.log('Test completed successfully');

            // Clean up spies
            validateProposalSpy.mockRestore();
            getProposalStateSpy.mockRestore();
            getAccountInfoSpy.mockRestore();
            sendTransactionSpy.mockRestore();
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
