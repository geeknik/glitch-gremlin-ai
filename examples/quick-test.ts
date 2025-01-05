import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';

async function quickTest() {
    // Initialize SDK
    const keypairData = JSON.parse(
        readFileSync(process.env.SOLANA_KEYPAIR_PATH!, 'utf-8')
    );
    const wallet = Keypair.fromSecretKey(Buffer.from(keypairData));
    
    const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet
    });

    // Create a simple test request
    console.log('Creating test request...');
    const request = await sdk.createChaosRequest({
        targetProgram: "11111111111111111111111111111111", // System program as example
        testType: TestType.FUZZ,
        duration: 60,  // 1 minute
        intensity: 1   // Minimum intensity
    });

    console.log(`Test request created with ID: ${request.requestId}`);
    
    // Wait for results
    console.log('Waiting for results...');
    const results = await request.waitForCompletion();
    
    console.log('\nTest Results:');
    console.log(JSON.stringify(results, null, 2));
}

quickTest().catch(console.error);
