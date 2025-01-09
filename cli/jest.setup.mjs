import { jest } from '@jest/globals';

// Mock any global dependencies here
jest.setTimeout(30000);

// Ensure the SDK is properly initialized
process.env.SOLANA_CLUSTER = 'https://api.devnet.solana.com';

// Add this to ensure proper ESM handling
export default {};
