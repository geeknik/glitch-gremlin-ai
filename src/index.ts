import GlitchSDK from './glitch-sdk';

const sdk1 = GlitchSDK.create({
cluster: process.env.SOLANA_CLUSTER || 'https://api.testnet.solana.com',
// other config
});
const sdk2 = GlitchSDK.create({
cluster: process.env.SOLANA_CLUSTER || 'devnet',
// other config
});
const sdk3 = GlitchSDK.create({
cluster: process.env.SOLANA_CLUSTER || 'devnet',
// other config
});
