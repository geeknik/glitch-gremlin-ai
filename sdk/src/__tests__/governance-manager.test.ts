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
import { GlitchError } from '../errors';

jest.mock('@solana/web3.js', () => require('../../ai/src/__mocks__/@solana/web3.js'));

describe('GovernanceManager', () => {
    let manager: GovernanceManager;
    let mockConnection: jest.Mocked<Connection>;
    let mockWallet: Keypair;
    let mockConfig: any;

    beforeEach(() => {
        mockConnection = {
            getAccountInfo: jest.fn(),
            sendAndConfirmTransaction: jest.fn(),
            getProgramAccounts: jest.fn()
        } as any;
        mockWallet = Keypair.generate();
        mockConfig = {
            programId: new PublicKey('GremlinGov11111111111111111111111111111111111'),
            treasuryAddress: new PublicKey('Treasury111111111111111111111111111111111'),
            minStakeAmount: 100,
            votingPeriod: 604800,
            quorumPercentage: 10,
            executionDelay: 172800
        };
        manager = new GovernanceManager(mockConnection, mockConfig);
    });

    describe('Initialization', () => {
        it('should initialize correctly', () => {
            expect(manager).toBeDefined();
            expect(manager.connection).toBe(mockConnection);
        });

        it('should validate config parameters', () => {
            expect(() => {
                new GovernanceManager(mockConnection, { ...mockConfig, minStakeAmount: -1 });
            }).toThrow(GlitchError);

            expect(() => {
                new GovernanceManager(mockConnection, { ...mockConfig, quorumPercentage: 101 });
            }).toThrow(GlitchError);
        });
    });

    describe('Proposal Management', () => {
        it('should create a proposal successfully', async () => {
            const title = "Test Proposal";
            const description = "Test Description";
            
            const result = await manager.createProposal(
                mockWallet.publicKey,
                title,
                description
            );

            expect(result.proposal).toBeDefined();
            expect(result.proposal.title).toBe(title);
            expect(result.proposal.description).toBe(description);
            expect(result.transaction).toBeInstanceOf(Transaction);
        });

        it('should reject invalid proposal parameters', async () => {
            await expect(
                manager.createProposal(mockWallet.publicKey, "", "description")
            ).rejects.toThrow(GlitchError);

            await expect(
                manager.createProposal(mockWallet.publicKey, "title", "")
            ).rejects.toThrow(GlitchError);
        });

        it('should fetch proposal details correctly', async () => {
            const proposalId = "proposal123";
            const proposal = await manager.getProposal(proposalId);
            
            expect(proposal).toBeDefined();
            expect(proposal.id).toBe(proposalId);
        });
    });

    describe('Voting', () => {
        it('should cast votes successfully', async () => {
            const proposalId = "proposal123";
            const transaction = await manager.vote(
                proposalId,
                mockWallet.publicKey,
                true
            );
            
            expect(transaction).toBeInstanceOf(Transaction);
        });

        it('should reject votes on inactive proposals', async () => {
            const proposalId = "inactiveProposal";
            
            // Mock getProposal to return an inactive proposal
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce({
                ...mockProposal,
                state: ProposalState.Executed
            });

            await expect(
                manager.vote(proposalId, mockWallet.publicKey, true)
            ).rejects.toThrow(GlitchError);
        });

        it('should reject votes after voting period', async () => {
            const proposalId = "expiredProposal";
            
            // Mock getProposal to return an expired proposal
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce({
                ...mockProposal,
                endTime: Date.now() / 1000 - 1000 // Set end time in the past
            });

            await expect(
                manager.vote(proposalId, mockWallet.publicKey, true)
            ).rejects.toThrow(GlitchError);
        });
    });

    describe('Proposal Execution', () => {
        it('should execute successful proposals', async () => {
            const proposalId = "successfulProposal";
            const transaction = await manager.executeProposal(proposalId);
            
            expect(transaction).toBeInstanceOf(Transaction);
        });

        it('should reject execution of unsuccessful proposals', async () => {
            const proposalId = "failedProposal";
            
            // Mock getProposal to return a failed proposal
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce({
                ...mockProposal,
                state: ProposalState.Defeated
            });

            await expect(
                manager.executeProposal(proposalId)
            ).rejects.toThrow(GlitchError);
        });

        it('should respect execution delay', async () => {
            const proposalId = "pendingProposal";
            
            // Mock getProposal to return a proposal in waiting period
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce({
                ...mockProposal,
                state: ProposalState.Succeeded,
                executionTime: Date.now() / 1000 + 1000 // Set execution time in the future
            });

            await expect(
                manager.executeProposal(proposalId)
            ).rejects.toThrow(GlitchError);
        });
    });
});
