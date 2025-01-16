import { GovernanceManager } from '../governance.js';

describe('GovernanceManager', () => {
    let governanceManager: GovernanceManager;

    beforeEach(() => {
        governanceManager = new GovernanceManager('programId', {});
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
