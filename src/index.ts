// src/index.ts
import GlitchSDK from './glitch-sdk';

async function initializeSDKs() {
    const sdk1 = await GlitchSDK.init({
        cluster: process.env.SOLANA_CLUSTER || 'https://api.testnet.solana.com',
        // other config
    });

    const sdk2 = await GlitchSDK.init({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        // other config
    });

    const sdk3 = await GlitchSDK.init({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        // other config
    });

    // You can use sdk1, sdk2, sdk3 here
}

initializeSDKs().catch(error => {
    console.error('Error initializing SDKs:', error);
});
