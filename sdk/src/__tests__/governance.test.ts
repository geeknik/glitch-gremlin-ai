import { GlitchSDK, TestType } from '../index';
import { Keypair } from '@solana/web3.js';

describe('Governance', () => {
    let sdk: GlitchSDK;
    
    beforeEach(async () => {
        const wallet = Keypair.generate();
        sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });
    });

    afterEach(async () => {
        if (sdk) {
            await sdk['queueWorker'].close();
            await sdk['connection'].disconnect();
        }
        // Clear any pending timers
        jest.clearAllTimers();
    });

    afterAll(async () => {
        // Ensure all connections are closed
        await sdk['connection'].disconnect();
    });

    describe('proposal creation', () => {
        it('should validate minimum stake requirements', async () => {
            await expect(sdk.createProposal({
                title: "Test Proposal",
                description: "Test Description",
                targetProgram: "11111111111111111111111111111111",
                testParams: {
                    testType: TestType.FUZZ,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                },
                stakingAmount: 50 // Below minimum
            })).rejects.toThrow('Insufficient stake amount');
        });

        it('should enforce proposal rate limits', async () => {
            const validProposal = {
                title: "Test Proposal",
                description: "Test Description",
                targetProgram: "11111111111111111111111111111111",
                testParams: {
                    testType: TestType.FUZZ,
                    duration: 300,
                    intensity: 5,
                    targetProgram: "11111111111111111111111111111111"
                },
                stakingAmount: 1000
            };

            // Create multiple proposals rapidly
            const promises = Array(3).fill(0).map(() => 
                sdk.createProposal(validProposal)
            );

            await expect(Promise.all(promises))
                .rejects.toThrow('Rate limit exceeded');
        });
    });

    describe('voting', () => {
        it('should require minimum token balance to vote', async () => {
            await expect(sdk.vote('test-proposal-id', true))
                .rejects.toThrow('Insufficient token balance to vote');
        });

        it('should prevent double voting', async () => {
            // Mock the first vote to succeed
            const mockSimulateTransaction = jest.spyOn(sdk['connection'], 'simulateTransaction')
                .mockResolvedValueOnce({
                    context: { slot: 0 },
                    value: { err: null, logs: [], accounts: null, unitsConsumed: 0, returnData: null }
                });

            await sdk.vote('test-proposal-id', true);

            // Second vote should fail
            await expect(sdk.vote('test-proposal-id', false))
                .rejects.toThrow('Already voted on this proposal');

            mockSimulateTransaction.mockRestore();
        });
    });

    describe('proposal execution', () => {
        it('should only execute passed proposals', async () => {
            const mockGetAccountInfo = jest.spyOn(sdk['connection'], 'getAccountInfo')
                .mockResolvedValueOnce({
                    data: Buffer.from('{"status":"failed"}'),
                    executable: false,
                    lamports: 0,
                    owner: sdk['programId'],
                    rentEpoch: 0
                });

            await expect(sdk.executeProposal('proposal-1234'))
                .rejects.toThrow('Proposal not passed');
        });

        it('should enforce timelock period', async () => {
            const mockGetAccountInfo = jest.spyOn(sdk['connection'], 'getAccountInfo')
                .mockResolvedValueOnce({
                    data: Buffer.from('{"status":"active","endTime":' + (Date.now() + 86400000) + '}'),
                    executable: false,
                    lamports: 0,
                    owner: sdk['programId'],
                    rentEpoch: 0
                });

            await expect(sdk.executeProposal('proposal-5678'))
                .rejects.toThrow('Timelock period not elapsed');
        });
    });
});
