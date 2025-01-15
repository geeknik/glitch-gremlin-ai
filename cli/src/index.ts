#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { Keypair } from '@solana/web3.js';
import { Command } from 'commander';
import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';
import ora from 'ora';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load version from package.json
const pkgJson = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf8')
);
const version = pkgJson.version;

const program = new Command();

// Ensure SDK compatibility
const require = createRequire(import.meta.url);
const sdkVersion = require('@glitch-gremlin/sdk/package.json').version;
if (version !== sdkVersion) {
console.error(chalk.red(`Error: Version mismatch. CLI: ${version}, SDK: ${sdkVersion}`));
process.exit(1);
}

program
  .name('glitch')
  .description('Glitch Gremlin AI CLI tool')
.version(version, '-v, --version');

// Test command
program
  .command('test')
  .description('Manage chaos tests')
.option('-p, --program <address>', 'Target program address')
.option('-t, --type <type>', 'Test type (FUZZ, LOAD, EXPLOIT, CONCURRENCY)', (val: string) => val as TestType)
.option('-d, --duration <seconds>', 'Test duration in seconds', (val: string) => parseInt(val), 300)
.option('-i, --intensity <level>', 'Test intensity (1-10)', (val: string) => parseInt(val), 5)
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

    // Validate program address
    if (!options.program || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(options.program)) {
    throw new Error('Invalid program address format');
    }

    // Validate duration
    const duration = parseInt(options.duration);
    if (isNaN(duration) || duration < 60 || duration > 3600) {
    throw new Error('Duration must be between 60 and 3600 seconds');
    }

    // Initialize SDK
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
    if (error instanceof Error) {
        switch(error.name) {
        case 'ValidationError':
            spinner.fail(chalk.red(`Parameter validation failed: ${error.message}`));
            break;
        case 'ConnectionError':
            spinner.fail(chalk.red(`Network error: ${error.message}`));
            break;
        case 'RateLimitError':
            spinner.fail(chalk.red(`Rate limit exceeded: ${error.message}`));
            break;
        default:
            spinner.fail(chalk.red(`Error: ${error.message}`));
        }
    } else {
        spinner.fail(chalk.red('An unknown error occurred'));
    }
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

// Security command
program
  .command('security')
  .description('Get security information for a Solana contract')
  .requiredOption('-p, --program <address>', 'Target program address')
  .action(async (options) => {
    const spinner = ora('Fetching security information...').start();

    try {
      const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
      if (!keypairPath) {
        throw new Error('SOLANA_KEYPAIR_PATH environment variable is not set');
      }

      // Validate program address
      if (!options.program || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(options.program)) {
        throw new Error('Invalid program address format');
      }

      // Initialize SDK
      const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet: Keypair.fromSecretKey(
          Buffer.from(JSON.parse(readFileSync(keypairPath, 'utf-8')))
        )
      });

      const securityInfo = await sdk.getSecurityInfo(options.program);

      spinner.succeed('Security information fetched successfully!');
      console.log(chalk.green('\nSecurity Information:'));
      console.log(JSON.stringify(securityInfo, null, 2));
    } catch (error) {
      if (error instanceof Error) {
        switch (error.name) {
          case 'ValidationError':
            spinner.fail(chalk.red(`Parameter validation failed: ${error.message}`));
            break;
          case 'ConnectionError':
            spinner.fail(chalk.red(`Network error: ${error.message}`));
            break;
          case 'RateLimitError':
            spinner.fail(chalk.red(`Rate limit exceeded: ${error.message}`));
            break;
          default:
            spinner.fail(chalk.red(`Error: ${error.message}`));
        }
      } else {
        spinner.fail(chalk.red('An unknown error occurred'));
      }
      process.exit(1);
    }
  });

program.parse();
