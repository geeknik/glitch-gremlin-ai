import { Command } from 'commander';
import { GlitchSDK } from './glitch-sdk.js';
import { TestType } from './types.js';

const program = new Command();

program
  .name('glitch-gremlin')
  .description('CLI for Glitch Gremlin AI chaos testing')
  .version('0.1.0');

program
  .command('test')
  .description('Run a chaos test on a Solana program')
  .requiredOption('-p, --program <address>', 'Target program address')
  .option('-t, --type <type>', 'Test type (FUZZ, LOAD, EXPLOIT, CONCURRENCY)', 'FUZZ')
  .option('-d, --duration <seconds>', 'Test duration in seconds', '300')
  .option('-i, --intensity <level>', 'Test intensity (1-10)', '5')
  .action(async (options) => {
    try {
        const sdk = new GlitchSDK({
            cluster: process.env.SOLANA_CLUSTER || 'devnet'
        });

        const request = await sdk.createChaosRequest({
            targetProgram: options.program,
            testType: options.type as TestType,
            duration: parseInt(options.duration),
            intensity: parseInt(options.intensity)
        });

        console.log(`Created chaos request: ${request.id}`);
        
        const results = await request.waitForCompletion();
        console.log('Test completed:', results);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
});

program.parse();
