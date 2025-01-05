import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';
import { Keypair } from '@solana/web3.js';

async function runBasicTest() {
    // Initialize SDK
    const keypairData = JSON.parse(
        readFileSync(process.env.SOLANA_KEYPAIR_PATH!, 'utf-8')
    );
    const wallet = Keypair.fromSecretKey(Buffer.from(keypairData));
    
    const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet
    });

    // Create a chaos request
    const request = await sdk.createChaosRequest({
        targetProgram: "Your program ID here",
        testType: TestType.FUZZ,
        duration: 300, // 5 minutes
        intensity: 5,  // Medium intensity
        params: {
            instructionTypes: ["all"],
            seedRange: [0, 1000000]
        }
    });

    console.log(`Created test request: ${request.requestId}`);

    // Wait for results
    const results = await request.waitForCompletion();
    console.log("Test completed!");
    console.log("Results:", JSON.stringify(results, null, 2));
}

runBasicTest().catch(console.error);
