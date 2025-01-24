import { GovernanceManager } from '../governance';
import { GOVERNANCE_CONFIG } from '../config/governance';
import { PublicKey, Keypair } from '@solana/web3.js';
import { describe, it, beforeEach, expect } from '@jest/globals';

jest.mock('@solana/web3.js', () => require('../../__mocks__/@solana/web3.js'));

describe('GovernanceManager', () => {
    let governanceManager: GovernanceManager;
    const mockConnection = {
        getAccountInfo: jest.fn(),
        getProgramAccounts: jest.fn()
    };

    beforeEach(() => {
        governanceManager = new GovernanceManager(
            mockConnection as any,
            Keypair.generate()
        );
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
