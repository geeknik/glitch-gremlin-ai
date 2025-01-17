import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    SystemProgram,
    TransactionInstruction
} from '@solana/web3.js';
import { ProposalState } from '../types';
import { GovernanceManager } from '../governance';

jest.mock('@solana/web3.js', () => require('../../ai/src/__mocks__/@solana/web3.js'));

describe('GovernanceManager', () => {
    let manager: GovernanceManager;
    let mockConnection: jest.Mocked<Connection>;

    beforeEach(() => {
        mockConnection = new Connection('http://localhost') as any; // Provide a dummy URL
        manager = new GovernanceManager(mockConnection);
    });

    it('should initialize correctly', () => {
        expect(manager).toBeDefined();
        expect(manager.connection).toBe(mockConnection);
    });

    it('should have required methods', () => {
        expect(manager.createProposal).toBeDefined();
        expect(manager.vote).toBeDefined();
        expect(manager.getProposal).toBeDefined();
        expect(manager.getProposals).toBeDefined();
        expect(manager.executeProposal).toBeDefined();
    });

    it('should initialize correctly', () => {
        expect(manager).toBeDefined();
        expect(manager.connection).toBe(mockConnection);
    });

    it('should have required methods', () => {
        expect(manager.createProposal).toBeDefined();
        expect(manager.vote).toBeDefined();
        expect(manager.getProposal).toBeDefined();
        expect(manager.getProposals).toBeDefined();
        expect(manager.executeProposal).toBeDefined();
    });

    // ... rest of the tests
});
