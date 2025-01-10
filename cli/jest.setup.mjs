// Convert to CommonJS since Jest has issues with ESM setup files
module.exports = () => {
  jest.setTimeout(30000);
  process.env.SOLANA_CLUSTER = 'https://api.devnet.solana.com';
  process.env.HELIUS_API_KEY = 'test-key'; // Mock Helius API key
};
