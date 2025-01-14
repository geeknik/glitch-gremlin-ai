import { GlitchSDK, TestType } from '../index';
import { Keypair } from '@solana/web3.js';
import { jest } from '@jest/globals';
describe('Rate Limiting', () => {
    let sdk;
    let mockIncr;
    let mockExpire;
    beforeEach(async () => {
        const wallet = Keypair.generate();
        sdk = await GlitchSDK.init({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });
        // Initialize mock functions with explicit