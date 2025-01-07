#!/usr/bin/env node
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node/esm using the new recommended approach
register('ts-node/esm', pathToFileURL('./'));

// Enhanced error handling
const handleError = (err: unknown) => {
    if (err instanceof Error) {
        console.error('❌ Error:', err.message);
        console.error('Stack:', err.stack);
    } else {
        console.error('❌ Unknown error:', JSON.stringify(err, null, 2));
    }
    process.exit(1);
};

process.on('unhandledRejection', handleError);
process.on('uncaughtException', handleError);

// Load environment variables
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const result = config({ path: path.join(__dirname, '.env') });

if (result.error) {
    console.error('❌ Error loading .env file:', result.error);
    process.exit(1);
}

console.log('✅ .env file loaded successfully.');

// Import dependencies after setting up error handlers
import { GlitchSDK, TestType } from '../sdk/src/index.js';
import { Keypair, Connection } from '@solana/web3.js';
import chalk from 'chalk';

async function main() {
    try {
        // Add debug logging for environment
        console.log('Node version:', process.version);
        console.log('Platform:', process.platform);
        console.log('Arch:', process.arch);
        console.log(chalk.bold.blue('\n🚀 Starting Glitch Gremlin AI Demo\n'));

        // 1. Setup
        console.log(chalk.cyan('1. Setting up environment...'));
        const wallet = Keypair.generate();
        const connection = new Connection('https://api.devnet.solana.com', {
            commitment: 'confirmed',
            disableRetryOnRateLimit: false
        });
        
        // Verify connection
        try {
            const version = await connection.getVersion();
            console.log(chalk.green('✅ Connected to Solana devnet!'));
            console.log(chalk.gray(`  Version: ${version['solana-core']}`));
        } catch (err) {
            console.error(chalk.red('❌ Failed to connect to Solana devnet:'));
            throw err;
        }

        // Log loaded environment variables for debugging
        console.log(chalk.gray('REDIS_HOST:', process.env.REDIS_HOST));
        console.log(chalk.gray('REDIS_PORT:', process.env.REDIS_PORT));

        // Initialize SDK with proper configuration
        console.log(chalk.cyan('\nInitializing SDK...'));
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'r.glitchgremlin.ai',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                connectTimeout: 5000,
                retryStrategy: (times: number) => Math.min(times * 50, 2000),
                maxRetriesPerRequest: 3
            };

            console.log('Initializing SDK with Redis config:', redisConfig);
            
            const sdk = await GlitchSDK.init({
                cluster: 'devnet',
                wallet,
                redisConfig
            });

            if (!sdk) {
                throw new Error('Failed to initialize SDK');
            }
            
            // Verify Redis connection
            try {
                const redisPing = await sdk['queueWorker']['redis'].ping();
                console.log(chalk.green('✅ Redis connection verified!'));
                console.log(chalk.gray(`Redis ping response: ${redisPing}`));
            } catch (redisErr) {
                console.error(chalk.red('❌ Failed to connect to Redis:'));
                if (redisErr instanceof Error) {
                    console.error(chalk.red(redisErr.message));
                    console.error(chalk.gray('\nRedis error stack:'));
                    console.error(chalk.gray(redisErr.stack));
                } else {
                    console.error(chalk.red('Unknown Redis error:', redisErr));
                }
                throw redisErr;
            }

            console.log(chalk.green('✅ SDK initialized successfully!'));

            // 2. Wallet Connection
            console.log(chalk.cyan('\n2. Connecting wallet...'));
            try {
                const balance = await connection.getBalance(wallet.publicKey);
                console.log(chalk.green(`✅ Wallet connected! Balance: ${balance} lamports`));
            } catch (err) {
                console.error(chalk.red('❌ Failed to connect wallet:'));
                if (err instanceof Error) {
                    console.error(chalk.red(err.message));
                    console.error(chalk.gray('Stack:'), err.stack);
                }
                throw err;
            }

            // 3. Create Chaos Request
            console.log(chalk.cyan('\n3. Creating chaos request...'));
            const targetProgram = '11111111111111111111111111111111'; // Example program
            let request;
            try {
                request = await sdk.createChaosRequest({
                    targetProgram,
                    testType: TestType.FUZZ,
                    duration: 300, // 5 minutes
                    intensity: 5
                });
                console.log(chalk.green(`✅ Chaos request created! ID: ${request.requestId}`));
            } catch (err) {
                console.error(chalk.red('❌ Failed to create chaos request:'));
                if (err instanceof Error) {
                    console.error(chalk.red(err.message));
                    console.error(chalk.gray('Stack:'), err.stack);
                }
                throw err;
            }

            // 4. Monitor Request
            console.log(chalk.cyan('\n4. Monitoring request status...'));
            try {
                const results = await request.waitForCompletion();
                console.log(chalk.green('✅ Chaos test completed!'));
                console.log(chalk.green('Results:'));
                console.log(results);
            } catch (err) {
                console.error(chalk.red('❌ Failed to monitor request:'));
                if (err instanceof Error) {
                    console.error(chalk.red(err.message));
                    console.error(chalk.gray('Stack:'), err.stack);
                }
                throw err;
            }

            // 5. Governance Demo
            console.log(chalk.cyan('\n5. Creating governance proposal...'));
            let proposal;
            try {
                proposal = await sdk.createProposal({
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
            } catch (err) {
                console.error(chalk.red('❌ Failed to create proposal:'));
                if (err instanceof Error) {
                    console.error(chalk.red(err.message));
                    console.error(chalk.gray('Stack:'), err.stack);
                }
                throw err;
            }

            // 6. Voting
            console.log(chalk.cyan('\n6. Voting on proposal...'));
            try {
                await sdk.vote(proposal.id, true);
                console.log(chalk.green('✅ Vote recorded!'));
            } catch (err) {
                console.error(chalk.red('❌ Failed to vote:'));
                if (err instanceof Error) {
                    console.error(chalk.red(err.message));
                    console.error(chalk.gray('Stack:'), err.stack);
                }
                throw err;
            }

            console.log(chalk.bold.blue('\n🎉 Demo complete!'));
        } catch (initErr) {
            console.error(chalk.red('❌ SDK initialization failed:'));
            if (initErr instanceof Error) {
                console.error(chalk.red(initErr.message));
                if (initErr.stack) {
                    console.error(chalk.gray('\nStack trace:'));
                    console.error(chalk.gray(initErr.stack));
                }
            } else {
                console.error(chalk.red('Unknown error:', initErr));
                try {
                    console.error(chalk.red('Error details:', JSON.stringify(initErr, null, 2)));
                } catch (e) {
                    console.error(chalk.red('Could not stringify error:', e));
                }
            }
            process.exit(1);
        }

}

// Wrap the main function in a try-catch block
(async () => {
    try {
        await main();
    } catch (err) {
        console.error(chalk.red('\n❌ Demo failed:'));
        if (err instanceof Error) {
            console.error(chalk.red(err.message));
            console.error(chalk.gray('\nStack trace:'));
            console.error(chalk.gray(err.stack));
        } else {
            console.error(chalk.red('Unknown error:', err));
        }
        process.exit(1);
    }
})();
