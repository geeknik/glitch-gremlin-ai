#!/usr/bin/env node
/**
 * Glitch Gremlin AI Command Line Interface
 * 
 * This CLI tool provides easy access to Glitch Gremlin's chaos testing features.
 * It requires the following environment variables:
 * - SOLANA_KEYPAIR_PATH: Path to your Solana keypair file
 * - SOLANA_CLUSTER: (Optional) Solana cluster to use (defaults to 'devnet')
 * 
 * @example
 * ```bash
 * # Run a basic fuzz test
 * glitch test -p <program> -t FUZZ -d 300 -i 5
 * 
 * # View test results
 * glitch test results <test-id>
 * ```
 */

import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';
import { Command } from 'commander';
import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';
import ora from 'ora';
import chalk from 'chalk';

const program = new Command();

program
  .name('glitch')
  .description('Glitch Gremlin AI CLI tool')
  .version('0.1.0');

program
  .command('test')
  .description('Manage chaos tests')
  .option('-p, --program <address>', 'Target program address')
  .option('-t, --type <type>', 'Test type (FUZZ, LOAD, EXPLOIT, CONCURRENCY)')
  .option('-d, --duration <seconds>', 'Test duration in seconds', '300')
  .option('-i, --intensity <level>', 'Test intensity (1-10)', '5')
  .action(async (options) => {
    const spinner = ora('Creating chaos request...').start();
    
    try {
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
    if (!keypairPath) {
        throw new Error('SOLANA_KEYPAIR_PATH environment variable is not set');
    }

    const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet: Keypair.fromSecretKey(
            Buffer.from(JSON.parse(readFileSync(keypairPath, 'utf-8')))
        )
    });

      const request = await sdk.createChaosRequest({
        targetProgram: options.program,
        testType: options.type as TestType,
        duration: parseInt(options.duration),
        intensity: parseInt(options.intensity)
      });

      spinner.succeed(`Created test request: ${request.requestId}`);
      
      spinner.start('Waiting for test completion...');
      const results = await request.waitForCompletion();
      
      spinner.succeed('Test completed!');
      console.log(chalk.green('\nResults:'));
      console.log(JSON.stringify(results, null, 2));
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program.parse();
