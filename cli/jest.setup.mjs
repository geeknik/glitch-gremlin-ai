export default () => {
  jest.setTimeout(30000);
  process.env.SOLANA_CLUSTER = 'https://api.devnet.solana.com';
  process.env.HELIUS_API_KEY = 'test-key';
};
