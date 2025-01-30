import { Command } from 'commander';
import { Keypair } from '@solana/web3.js';
import { GlitchSDK } from './index.js';
import { TestType } from './types.js';
import { GlitchError } from './errors.js';
import type { ChaosRequestParams } from './types.js';

const program = new Command();

program
    .name('glitch-gremlin')
    .description('CLI tool for Glitch Gremlin - Solana Program Security Testing')
    .version('1.0.0')
    .requiredOption('-p, --target-program <address>', 'Target program address to test')
    .option('-d, --duration <seconds>', 'Test duration in seconds', '60')
    .option('-i, --intensity <level>', 'Test intensity level (1-10)', '1')
    .option('-t, --test-type <type>', 'Test type (FUZZ, DOS, etc)', 'FUZZ')
    .option('-e, --env <environment>', 'Execution environment', 'sgx')
    .option('-s, --security-level <level>', 'Security level (1-4)', '2')
    .option('--cluster <cluster>', 'Solana cluster to use', 'devnet')
    .option('--keypair <path>', 'Path to keypair file')
    .option('--redis-url <url>', 'Redis connection URL')
    .option('--helius-key <key>', 'Helius API key');

async function main() {
    try {
        // Initialize SDK with proper configuration
        const sdk = await GlitchSDK.create({
            cluster: program.getOptionValue('cluster'),
            wallet: program.getOptionValue('keypair') 
                ? Keypair.fromSecretKey(Buffer.from(require(program.getOptionValue('keypair'))))
                : Keypair.generate(),
            redisConfig: {
                url: program.getOptionValue('redis-url')
            },
            heliusApiKey: program.getOptionValue('helius-key')
        });

        // Create chaos request parameters
        const params: ChaosRequestParams = {
            targetProgram: program.getOptionValue('target-program'),
            testType: TestType[program.getOptionValue('test-type') as keyof typeof TestType] || TestType.FUZZ,
            duration: parseInt(program.getOptionValue('duration')) || 60,
            intensity: parseInt(program.getOptionValue('intensity')) || 1,
            executionEnvironment: program.getOptionValue('env') || 'sgx',
            securityLevel: parseInt(program.getOptionValue('security-level')) || 2
        };

        // Create and monitor the chaos request
        console.log('Creating chaos request...');
        const request = await sdk.createChaosRequest(params);
        console.log('Request created:', request);
        
        console.log('Waiting for test results...');
        const result = await sdk.waitForTestResult(request.requestId);
        console.log('Test completed:', result);
        
        // Cleanup and exit
        await sdk.cleanup();
        process.exit(result.status === 'success' ? 0 : 1);
    } catch (error) {
        if (error instanceof GlitchError) {
            console.error(`Error: ${error.message} (${error.code})`);
            if (error.details) {
                console.error('Details:', error.details);
            }
        } else {
            console.error('Unexpected error:', error);
        }
        process.exit(1);
    }
}

main();
