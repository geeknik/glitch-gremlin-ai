import { PublicKey, Connection } from '@solana/web3.js';

// Configure longer timeout for blockchain operations
jest.setTimeout(60000);

// Custom matchers for Solana-specific testing
expect.extend({
toBeValidPublicKey(received) {
    let pass = false;
    try {
    new PublicKey(received);
    pass = true;
    } catch (e) {
    pass = false;
    }
    return {
    message: () => `expected ${received} to be a valid Solana public key`,
    pass,
    };
},
toBeValidSignature(received) {
    const pass = received.length === 88 || received.length === 87;
    return {
    message: () => `expected ${received} to be a valid Solana transaction signature`,
    pass,
    };
},
toMatchSecurityScore(received: number, expectedScore: number) {
    const pass = received >= 0 && received <= 100 && 
                Math.abs(received - expectedScore) <= 5;
    return {
    message: () => `expected security score ${received} to be within 5 points of ${expectedScore}`,
    pass,
    };
},
toHaveBalance(received: string | number | bigint, expected: string | number | bigint) {
    const pass = BigInt(received) === BigInt(expected);
    return {
    message: () => `expected balance ${received} to equal ${expected}`,
    pass,
    };
},
});

// Test utilities
declare global {
var getTestConnection: () => Connection;
var createTestAccount: () => Promise<{ publicKey: PublicKey }>;
var airdropToAccount: (pubkey: PublicKey, amount: number) => Promise<string>;
}

global.getTestConnection = () => new Connection('http://localhost:8899', 'confirmed');

global.createTestAccount = async () => {
throw new Error('Test account creation not implemented');
};

global.airdropToAccount = async (pubkey: PublicKey, amount: number) => {
throw new Error('Airdrop not implemented');
};

// Reset mocks between tests
beforeEach(() => {
jest.clearAllMocks();
});
