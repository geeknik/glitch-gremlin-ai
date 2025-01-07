#!/usr/bin/env node
// Load environment variables at the very top
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the demo directory
const result = config({ path: path.join(__dirname, '.env') });

if (result.error) {
    console.error('❌ Error loading .env file:', result.error);
    process.exit(1);
} else {
    console.log('✅ .env file loaded successfully.');
}

import { GlitchSDK, TestType } from '../sdk/src/index.js';
import { Keypair, Connection } from '@solana/web3.js';
import chalk from 'chalk';

async function main() {
    console.log(chalk.bold.blue('\n🚀 Starting Glitch Gremlin AI Demo\n'));

    // 1. Setup
    console.log(chalk.cyan('1. Setting up environment...'));
    const wallet = Keypair.generate();
    const connection = new Connection('https://api.devnet.solana.com');
    
    // Log loaded environment variables for debugging
    console.log('REDIS_HOST:', process.env.REDIS_HOST);
    console.log('REDIS_PORT:', process.env.REDIS_PORT);

    // Initialize SDK with proper configuration
    const sdk = await GlitchSDK.init({
        cluster: 'devnet',
        wallet,
        redisConfig: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            // No password needed
        }
    });

    console.log('✅ SDK initialized successfully.');

    // 2. Wallet Connection
    console.log(chalk.cyan('\n2. Connecting wallet...'));
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(chalk.green(`✅ Wallet connected! Balance: ${balance} lamports`));

    // 3. Create Chaos Request
    console.log(chalk.cyan('\n3. Creating chaos request...'));
    const targetProgram = '11111111111111111111111111111111'; // Example program
    const request = await sdk.createChaosRequest({
        targetProgram,
        testType: TestType.FUZZ,
        duration: 300, // 5 minutes
        intensity: 5
    });
    console.log(chalk.green(`✅ Chaos request created! ID: ${request.requestId}`));

    // 4. Monitor Request
    console.log(chalk.cyan('\n4. Monitoring request status...'));
    const results = await request.waitForCompletion();
    console.log(chalk.green('✅ Chaos test completed!'));
    console.log(chalk.green('Results:'));
    console.log(results);

    // 5. Governance Demo
    console.log(chalk.cyan('\n5. Creating governance proposal...'));
    const proposal = await sdk.createProposal({
        title: "Test Proposal",
        description: "Test Description",
        targetProgram,
        testParams: {
            testType: TestType.FUZZ,
            duration: 300,
            intensity: 5,
            targetProgram
        },
        stakingAmount: 1000
    });
    console.log(chalk.green(`✅ Proposal created! ID: ${proposal.id}`));

    // 6. Voting
    console.log(chalk.cyan('\n6. Voting on proposal...'));
    await sdk.vote(proposal.id, true);
    console.log(chalk.green('✅ Vote recorded!'));

    console.log(chalk.bold.blue('\n🎉 Demo complete!'));
}

main().catch(err => {
    console.error(chalk.red('\n❌ Demo failed:'));
    console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
    console.error(chalk.gray('\nStack trace:'));
    console.error(chalk.gray(err instanceof Error ? err.stack : 'No stack trace available'));
    process.exit(1);
});
