#!/usr/bin/env node
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
      const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet: process.env.SOLANA_KEYPAIR_PATH
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
