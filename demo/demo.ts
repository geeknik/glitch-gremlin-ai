import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
dotenv.config();

// Global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [GLOBAL] Unhandled Rejection at Promise:', promise);
  if (reason instanceof Error) {
    console.error('Reason (Error):', reason.message);
    console.error(reason.stack);
  } else {
    console.error('Reason (non-Error):', reason);
    try {
      console.error('JSON:', JSON.stringify(reason, null, 2));
    } catch (jsonErr) {
      console.error('Could not JSON.stringify the reason:', jsonErr);
    }
  }
});

import chalk from 'chalk';
import { Keypair, Connection } from '@solana/web3.js';
import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';

async function main() {
    // Add debug logging for environment
    console.log('Node version:', process.version);
    console.log('Platform:', process.platform);
    console.log('Arch:', process.arch);
    console.log(chalk.bold.blue('\n🚀 Starting Glitch Gremlin AI Demo\n'));

    // 1. Setup
    console.log(chalk.cyan('1. Setting up environment...'));
    // Use persistent demo wallet if it exists, otherwise create it
    const walletPath = './demo-wallet.json';
    let wallet: Keypair;
    
    if (existsSync(walletPath)) {
      const keypair = JSON.parse(readFileSync(walletPath, 'utf-8'));
      wallet = Keypair.fromSecretKey(Uint8Array.from(keypair));
      console.log(chalk.green('✅ Using existing demo wallet'));
    } else {
      wallet = Keypair.generate();
      writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)));
      console.log(chalk.green('✅ Created new demo wallet'));
    }
    
    console.log(chalk.gray('Wallet address:', wallet.publicKey.toString()));
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=17682982-5929-468d-89cf-a6965d9803cb', {
        commitment: 'confirmed',
        disableRetryOnRateLimit: false,
        httpHeaders: {
            'Content-Type': 'application/json'
        }
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
                maxRetriesPerRequest: 3,
                enableOfflineQueue: true,
                lazyConnect: true
            };

            console.log('Initializing SDK with Redis config:', redisConfig);
            
            const sdk = await GlitchSDK.init({
                cluster: 'https://mainnet.helius-rpc.com/?api-key=17682982-5929-468d-89cf-a6965d9803cb',
                wallet,
                redisConfig
            });

            if (!sdk) {
                throw new Error('Failed to initialize SDK');
            }
            
            // Add Redis error handler
            sdk['queueWorker']['redis'].on('error', (err: Error) => {
                console.error('Redis connection error:', err);
                process.exit(1);
            });
            
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
            let balance = await connection.getBalance(wallet.publicKey);
            
            // Only airdrop if balance is less than 0.1 SOL
            if (balance < 100_000_000) {
                const maxRetries = 5; // Increased retry count
                let retryCount = 0;
                let airdropSuccess = false;
                let airdropAmount = 500_000_000; // Start with 0.5 SOL
                
                while (retryCount < maxRetries && !airdropSuccess) {
                    try {
                        console.log(chalk.gray(`Attempting airdrop of ${airdropAmount} lamports (${retryCount + 1}/${maxRetries})...`));
                        console.log(chalk.gray('Request payload:', JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'requestAirdrop',
                            params: [
                                wallet.publicKey.toString(),
                                airdropAmount,
                                {
                                    commitment: 'confirmed'
                                }
                            ]
                        })));
                        // Use Helius API for airdrop
                        const airdropResponse = await fetch('https://mainnet.helius-rpc.com/?api-key=17682982-5929-468d-89cf-a6965d9803cb', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'requestAirdrop',
                                params: [
                                    wallet.publicKey.toString(),
                                    airdropAmount
                                ]
                            })
                        });

                        if (!airdropResponse.ok) {
                            const errorText = await airdropResponse.text();
                            throw new Error(`Helius API error: ${errorText}`);
                        }

                        const airdropData = await airdropResponse.json();
            
                        if (airdropData.error) {
                            throw new Error(`Helius error: ${airdropData.error.message}`);
                        }
            
                        if (!airdropData.result) {
                            throw new Error('Airdrop failed: No transaction signature returned');
                        }

                        // Wait for confirmation
                        const signature = airdropData.result;
                        const latestBlockhash = await connection.getLatestBlockhash();
                        await connection.confirmTransaction({
                            signature,
                            blockhash: latestBlockhash.blockhash,
                            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
                        }, 'confirmed');
                        airdropSuccess = true;
                    } catch (err) {
                        retryCount++;
                        if (retryCount === maxRetries) {
                            console.warn(chalk.yellow('⚠️ Airdrop failed after multiple attempts. Using existing balance.'));
                        } else {
                            // Reduce airdrop amount and increase wait time
                            airdropAmount = Math.floor(airdropAmount / 2);
                            const waitTime = Math.min(2000 * (retryCount + 1), 10000); // Max 10s wait
                            console.warn(chalk.yellow(`⚠️ Airdrop failed, retrying with ${airdropAmount} lamports in ${waitTime}ms...`));
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }
                    }
                }
                
                // Get updated balance
                balance = await connection.getBalance(wallet.publicKey);
                console.log(chalk.green(`✅ Wallet connected! Balance: ${balance} lamports`));
            } else {
                console.log(chalk.green(`✅ Wallet connected! Balance: ${balance} lamports`));
            }
            
            console.log(chalk.green(`✅ Wallet connected! Balance: ${balance} lamports`));

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
            if (balance < 50_000_000) { // Need at least 0.05 SOL
                console.log(chalk.yellow('⚠️ Insufficient balance for governance proposal. Need at least 0.05 SOL.'));
            } else {
                try {
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
                        stakingAmount: Math.min(50_000_000, balance) // Use up to 0.05 SOL or available balance
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
            }

            // 6. Governance Demo
            console.log(chalk.cyan('\n6. Governance Demo...'));
            if (balance < 50_000_000) { // Need at least 0.05 SOL
                console.log(chalk.yellow('⚠️ Insufficient balance for governance demo. Need at least 0.05 SOL.'));
            } else {
                try {
                    // Create proposal
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
                        stakingAmount: Math.min(50_000_000, balance) // Use up to 0.05 SOL or available balance
                    });
                    console.log(chalk.green(`✅ Proposal created! ID: ${proposal.id}`));

                    // Voting
                    console.log(chalk.cyan('\n6.1 Voting on proposal...'));
                    await sdk.vote(proposal.id, true);
                    console.log(chalk.green('✅ Vote recorded!'));
                } catch (err) {
                    console.error(chalk.red('❌ Governance demo failed:'));
                    if (err instanceof Error) {
                        console.error(chalk.red(err.message));
                        console.error(chalk.gray('Stack:'), err.stack);
                    }
                    throw err;
                }
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

// Main execution
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
