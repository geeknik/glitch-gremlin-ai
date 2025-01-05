import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';
import { Keypair } from '@solana/web3.js';
import chalk from 'chalk';

async function quickTest() {
    console.log(chalk.blue('Creating ephemeral test wallet...'));
    
    // Generate a new random keypair for testing
    const wallet = Keypair.generate();
    console.log(chalk.green('Test wallet public key:'), wallet.publicKey.toString());
    
    try {
        const sdk = new GlitchSDK({
            cluster: 'https://api.devnet.solana.com',
            wallet
        });

        console.log(chalk.blue('Creating test request...'));
    const request = await sdk.createChaosRequest({
        targetProgram: "11111111111111111111111111111111", // System program as example
        testType: TestType.FUZZ,
        duration: 60,  // 1 minute
        intensity: 1   // Minimum intensity
    });

        console.log(chalk.green('Test request created with ID:'), request.requestId);
        
        console.log(chalk.blue('Waiting for results...'));
        const results = await request.waitForCompletion();
        
        console.log(chalk.green('\nTest Results:'));
        console.log(JSON.stringify(results, null, 2));
    } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

quickTest();
