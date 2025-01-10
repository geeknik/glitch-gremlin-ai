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
import { GlitchSDK, TestType, version as sdkVersion } from '@glitch-gremlin/sdk';
import ora from 'ora';
import chalk from 'chalk';

const program = new Command();

// Ensure SDK compatibility
const CLI_VERSION = '0.1.0';
const REQUIRED_SDK_VERSION = '0.1.0';

if (sdkVersion !== REQUIRED_SDK_VERSION) {
  console.error(chalk.red(`Error: SDK version mismatch. Required: ${REQUIRED_SDK_VERSION}, Found: ${sdkVersion}`));
  process.exit(1);
}

// Ensure SDK compatibility
if (sdkVersion !== CLI_VERSION) {
  console.error(chalk.red(`Error: SDK version mismatch. Required: ${CLI_VERSION}, Found: ${sdkVersion}`));
  process.exit(1);
}

program
  .name('glitch')
  .description('Glitch Gremlin AI CLI tool')
  .version(CLI_VERSION, '-v, --version', 'Output the current version');

// Test command
program
  .command('test')
  .description('Manage chaos tests')
  .option('-p, --program <address>', 'Target program address')
  .option('-t, --type <type>', 'Test type (FUZZ, LOAD, EXPLOIT, CONCURRENCY)')
  .option('-d, --duration <seconds>', 'Test duration in seconds', '300')
  .option('-i, --intensity <level>', 'Test intensity (1-10)', '5')
  .option('--fuzz-seed-range <range>', 'Seed range for fuzz testing (min,max)')
  .option('--load-tps <tps>', 'Transactions per second for load testing')
  .option('--exploit-categories <cats>', 'Exploit categories to test (comma-separated)')
  .action(async (options) => {
    const spinner = ora('Creating chaos request...').start();
    
    try {
      const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
      if (!keypairPath) {
        throw new Error('SOLANA_KEYPAIR_PATH environment variable is not set');
      }

      const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'https://api.testnet.solana.com',
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

// Governance commands
const governance = program
  .command('governance')
  .description('Manage governance proposals');

governance
  .command('propose')
  .description('Create a new proposal')
  .requiredOption('-t, --title <title>', 'Proposal title')
  .requiredOption('-d, --description <desc>', 'Proposal description')
  .requiredOption('-p, --program <address>', 'Target program address')
  .requiredOption('-s, --stake <amount>', 'Amount of GLITCH to stake')
  .action(async (options) => {
    const spinner = ora('Creating proposal...').start();
    try {
      const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet: Keypair.fromSecretKey(
          Buffer.from(JSON.parse(readFileSync(process.env.SOLANA_KEYPAIR_PATH!, 'utf-8')))
        )
      });
      const proposal = await sdk.createProposal({
        title: options.title,
        description: options.description,
        targetProgram: options.program,
        stakingAmount: parseInt(options.stake),
        testParams: {
          targetProgram: options.program,
          testType: TestType.FUZZ,
          duration: 300,
          intensity: 5
        }
      });
      spinner.succeed(`Created proposal: ${proposal.id}`);
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

governance
  .command('vote')
  .description('Vote on a proposal')
  .requiredOption('-p, --proposal <id>', 'Proposal ID')
  .requiredOption('-v, --vote <yes|no>', 'Your vote')
  .action(async (options) => {
    const spinner = ora('Submitting vote...').start();
    try {
      const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet: Keypair.fromSecretKey(
          Buffer.from(JSON.parse(readFileSync(process.env.SOLANA_KEYPAIR_PATH!, 'utf-8')))
        )
      });
      await sdk.vote(options.proposal, options.vote === 'yes');
      spinner.succeed('Vote submitted successfully');
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program.parse();
