import { GovernanceManager } from '../governance';
import { PublicKey } from '@solana/web3.js';

jest.mock('@solana/web3.js', () => require('../../../sdk/src/ai/src/__mocks__/@solana/web3.js'));

describe('GovernanceManager', () => {
    let governanceManager: GovernanceManager;
    const mockConnection = {
        getAccountInfo: jest.fn(),
        getProgramAccounts: jest.fn()
    };

    beforeEach(() => {
        governanceManager = new GovernanceManager(mockConnection as any);
    });

    it('should initialize correctly', () => {
        expect(governanceManager).toBeDefined();
    });

    it('should have required methods', () => {
        expect(governanceManager.initialize).toBeDefined();
        expect(governanceManager.createProposal).toBeDefined();
        expect(governanceManager.vote).toBeDefined();
        expect(governanceManager.executeProposal).toBeDefined();
    });
});
