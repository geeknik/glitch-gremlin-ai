import { GovernanceManager } from '../governance';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { GlitchError } from '../errors';

jest.mock('@solana/web3.js');

describe('GovernanceManager', () => {
    let governanceManager;
    let connection;
    let wallet;
    let validateProposalMock;
    let simulateTransactionMock;
    let sendTransactionMock;

    beforeEach(() => {
        connection = new Connection('http://localhost:8899', 'confirmed');
        wallet = Keypair.generate();
        governanceManager = new GovernanceManager(new PublicKey('GLt5cQeRgVMqnE9DGJQNNrbAfnRQYWqYVNWnJo7WNLZ9'));
        
        validateProposalMock = jest.spyOn(governanceManager, 'validateProposal').mockResolvedValue(true);
        simulateTransactionMock = jest.spyOn(connection, 'simulateTransaction').mockResolvedValue({ value: { err: null }});
        sendTransactionMock = jest.spyOn(connection, 'sendTransaction').mockResolvedValue('tx-hash');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('proposal creation', () => {
        it('should create a proposal with valid parameters', async () => {
            const { proposalAddress, txHash } = await governanceManager.createProposal({
                title: 'Test Proposal',
                description: 'Test Description',
                programId: new PublicKey('11111111111111111111111111111111'),
                instruction: {
                    data: Buffer.from('test'),
                    accounts: []
                }
            });

            expect(proposalAddress).toBeDefined();
            expect(txHash).toBe('tx-hash');
            expect(validateProposalMock).toHaveBeenCalled();
            expect(simulateTransactionMock).toHaveBeenCalled();
            expect(sendTransactionMock).toHaveBeenCalled();
        });

        it('should validate proposal parameters', async () => {
            const invalidProposal = {
                title: '',  // Invalid - empty title
                description: 'Test',
                programId: new PublicKey('11111111111111111111111111111111'),
                instruction: { data: Buffer.from('test'), accounts: [] }
            };

            await expect(governanceManager.createProposal(invalidProposal))
                .rejects.toThrow('Invalid proposal parameters');
        });
    });

    describe('proposal validation', () => {
        it('should validate quorum requirements', async () => {
            const proposalAddress = new PublicKey('22222222222222222222222222222222');
            validateProposalMock.mockResolvedValueOnce(false);

            await expect(governanceManager.validateProposal(proposalAddress))
                .rejects.toThrow('Proposal does not meet quorum requirements');
        });

        it('should validate timelock period', async () => {
            const proposalAddress = new PublicKey('22222222222222222222222222222222');
            governanceManager.getProposalTimestamp = jest.fn().mockResolvedValue(Date.now());

            await expect(governanceManager.validateProposal(proposalAddress))
                .rejects.toThrow('Timelock period not elapsed');
        });
    });

    describe('proposal execution', () => {
        it('should execute valid proposals', async () => {
            const proposalAddress = new PublicKey('22222222222222222222222222222222');
            validateProposalMock.mockResolvedValueOnce(true);

            const result = await governanceManager.executeProposal(proposalAddress);
            
            expect(result.success).toBe(true);
            expect(sendTransactionMock).toHaveBeenCalled();
        });

        it('should prevent execution of invalid proposals', async () => {
            const proposalAddress = new PublicKey('22222222222222222222222222222222');
            validateProposalMock.mockResolvedValueOnce(false);

            await expect(governanceManager.executeProposal(proposalAddress))
                .rejects.toThrow('Invalid proposal state');
        });

        it('should handle execution errors gracefully', async () => {
            const proposalAddress = new PublicKey('22222222222222222222222222222222');
            validateProposalMock.mockResolvedValueOnce(true);
            sendTransactionMock.mockRejectedValueOnce(new Error('Execution failed'));

            await expect(governanceManager.executeProposal(proposalAddress))
                .rejects.toThrow('Failed to execute proposal');
        });
    });
});
