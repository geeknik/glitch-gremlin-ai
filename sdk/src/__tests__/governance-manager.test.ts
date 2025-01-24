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
        manager = new GovernanceManager(
            mockConnection, 
            new PublicKey('GremlinGov11111111111111111111111111111111111'),
            mockConfig
        );
    });

    describe('Initialization', () => {
        it('should initialize correctly', () => {
            expect(manager).toBeDefined();
            expect(manager.connection).toBe(mockConnection);
        });

        it('should validate config parameters', () => {
            expect(() => {
                new GovernanceManager(
                    mockConnection, 
                    new PublicKey('GremlinGov11111111111111111111111111111111111'),
                    { ...mockConfig, minStakeAmount: -1 }
                );
            }).toThrow("minStakeAmount must be greater than 0");

            expect(() => {
                new GovernanceManager(
                    mockConnection,
                    new PublicKey('GremlinGov11111111111111111111111111111111111'),
                    { ...mockConfig, quorumPercentage: 101 }
                );
            }).toThrow("quorumPercentage must be between 1 and 100");
        });
    });

    // Add mock proposal data
    const mockProposal: ProposalData = {
        title: 'Test Proposal',
        description: 'Test Description',
        proposer: new PublicKey('Proposal111111111111111111111111111111111111'),
        startTime: Date.now() / 1000,
        endTime: Date.now() / 1000 + 10000,
        executionTime: Date.now() / 1000 + 20000,
        voteWeights: { yes: 0, no: 0, abstain: 0 },
        votes: [],
        quorum: 0,
        executed: false,
        status: ProposalState.Draft.toString()
    };

    describe('Proposal Management', () => {
        it('should create a proposal successfully', async () => {
            const result = await manager.createProposal({
                proposer: mockWallet.publicKey,
                title: "Test Proposal",
                description: "Test Description"
            });

            expect(result.proposalAddress).toBeDefined();
            expect(result.tx).toBeInstanceOf(Transaction);
        });

        it('should reject invalid proposal parameters', async () => {
            await expect(
                manager.createProposal({
                    wallet: mockWallet,
                    title: "",
                    description: "description"
                })
            ).rejects.toThrow(GlitchError);

            await expect(
                manager.createProposal({
                    wallet: mockWallet,
                    title: "title",
                    description: ""
                })
            ).rejects.toThrow(GlitchError);
        });

        it('should fetch proposal details correctly', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111111');
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce(mockProposal);
            
            const proposal = await manager.getProposal(proposalId);
            expect(proposal).toBeDefined();
            expect(proposal.id.equals(proposalId)).toBeTruthy();
        });
    });

    describe('Voting', () => {
        it('should cast votes successfully', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111111');
            const transaction = await manager.vote(proposalId, true);
            
            expect(transaction).toBeInstanceOf(Transaction);
        });

        it('should reject votes on inactive proposals', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111111');
            
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce({
                ...mockProposal,
                state: ProposalState.Executed
            });

            await expect(
                manager.vote({
                    wallet: mockWallet,
                    proposalId,
                    vote: true
                })
            ).rejects.toThrow(GlitchError);
        });
    });

    describe('Proposal Execution', () => {
        it('should execute successful proposals', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111111');
            const transaction = await manager.executeProposal(
                mockConnection,
                mockWallet,
                proposalId
            );
            
            expect(transaction).toBeInstanceOf(Transaction);
        });

        it('should reject execution of unsuccessful proposals', async () => {
            const proposalId = new PublicKey('Proposal111111111111111111111111111111111111');
            
            jest.spyOn(manager, 'getProposal').mockResolvedValueOnce({
                ...mockProposal,
                state: ProposalState.Defeated
            });

            await expect(
                manager.executeProposal({
                    wallet: mockWallet,
                    proposalId
                })
            ).rejects.toThrow(GlitchError);
        });
    });
});
