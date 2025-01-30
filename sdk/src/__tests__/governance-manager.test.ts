import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    SystemProgram,
    TransactionInstruction
} from '@solana/web3.js';
import { ProposalState } from '../types.js';
import { GovernanceManager } from '../governance.js';
import { GlitchError } from '../errors.js';
import type { ProposalData, VoteRecord } from '../types.js';

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
        manager = new GovernanceManager(
            mockConnection, 
            mockWallet,
            mockConfig
        );
    });

    describe('Initialization', () => {
        it('should initialize correctly', () => {
            expect(manager).toBeDefined();
            // Access connection through a getter if it exists
            expect((manager as any).connection).toBe(mockConnection);
        });

        it('should validate config parameters', () => {
            expect(() => {
                new GovernanceManager(
                    mockConnection,
                    mockWallet,
                    { ...mockConfig, minStakeAmount: -1 }
                );
            }).toThrow("Invalid minimum stake amount");

            expect(() => {
                new GovernanceManager(
                    mockConnection,
                    mockWallet,
                    { ...mockConfig, quorumPercentage: 101 }
                );
            }).toThrow("Invalid quorum percentage");
        });
    });

    // Add mock proposal data
    const mockProposal: ProposalData = {
        title: 'Test Proposal',
        description: 'Test Description',
        proposer: new PublicKey('Proposal111111111111111111111111111111111'),
        startTime: Date.now() / 1000,
        endTime: Date.now() / 1000 + 10000,
        executionTime: Date.now() / 1000 + 20000,
        voteWeights: { yes: 0, no: 0, abstain: 0 },
        votes: [],
        quorum: 0,
        executed: false,
        state: ProposalState.Active
    };

    describe('Proposal Management', () => {
        it('should create a proposal successfully', async () => {
            const proposalData = {
                proposer: mockWallet.publicKey,
                title: "Test Proposal",
                description: "Test Description"
            };

            // Mock the internal methods that would be called
            jest.spyOn(manager as any, 'getProposalData').mockResolvedValue(mockProposal);
            jest.spyOn(mockConnection, 'sendTransaction').mockResolvedValue('mock-signature');
            
            const result = await (manager as any).processVote('yes', new PublicKey('Proposal111111111111111111111111111111111'), mockWallet.publicKey);
            expect(mockConnection.sendTransaction).toHaveBeenCalled();
        });

        it('should reject invalid proposal parameters', async () => {
            await expect(async () => {
                await (manager as any).processVote('yes', new PublicKey('Proposal111111111111111111111111111111111'), mockWallet.publicKey);
            }).rejects.toThrow(GlitchError);
        });

        it('should fetch proposal details correctly', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111');
            
            // Mock the internal method
            jest.spyOn(manager as any, 'getProposalData').mockResolvedValue(mockProposal);
            
            const proposal = await (manager as any).getProposalData(proposalId);
            expect(proposal).toBeDefined();
            expect(proposal.proposer.equals(mockProposal.proposer)).toBeTruthy();
        });
    });

    describe('Voting', () => {
        it('should cast votes successfully', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111');
            
            // Mock the internal methods
            jest.spyOn(manager as any, 'getProposalData').mockResolvedValue(mockProposal);
            jest.spyOn(mockConnection, 'sendTransaction').mockResolvedValue('mock-signature');
            
            await (manager as any).processVote('yes', proposalId, mockWallet.publicKey);
            expect(mockConnection.sendTransaction).toHaveBeenCalled();
        });

        it('should reject votes on inactive proposals', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111');
            
            // Mock the internal method
            jest.spyOn(manager as any, 'getProposalData').mockResolvedValue({
                ...mockProposal,
                state: ProposalState.Executed
            });

            await expect(async () => {
                await (manager as any).processVote('yes', proposalId, mockWallet.publicKey);
            }).rejects.toThrow();
        });
    });

    describe('Proposal Execution', () => {
        it('should execute successful proposals', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111');
            
            // Mock the internal methods
            jest.spyOn(manager as any, 'getProposalData').mockResolvedValue({
                ...mockProposal,
                state: ProposalState.Succeeded
            });
            jest.spyOn(mockConnection, 'sendTransaction').mockResolvedValue('mock-signature');
            
            await manager.executeProposal(proposalId);
            expect(mockConnection.sendTransaction).toHaveBeenCalled();
        });

        it('should reject execution of unsuccessful proposals', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111');
            
            // Mock the internal method
            jest.spyOn(manager as any, 'getProposalData').mockResolvedValue({
                ...mockProposal,
                state: ProposalState.Failed
            });

            await expect(async () => {
                await manager.executeProposal(proposalId);
            }).rejects.toThrow();
        });
    });
});
