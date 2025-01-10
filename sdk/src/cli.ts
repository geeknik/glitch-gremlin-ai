import { GlitchSDK } from './sdk.js';
import { Keypair } from '@solana/web3.js';
import { Command } from 'commander';
import { readPackageJson } from './utils.js';

const program = new Command();

const pkg = readPackageJson();

program
  .version(pkg.version)
  .command('create-chaos-request')
  .description('Create a chaos request')
.action(async () => {
    try {
        const sdk = await GlitchSDK.init({
            cluster: 'devnet', 
            wallet: Keypair.generate()
        });
        await sdk.createChaosRequest({
            targetProgram: program.targetProgram,
            testType: TestType.FUZZ,
            duration: program.duration || 60,
            intensity: program.intensity || 1
        });
        console.log('Chaos request created successfully');
    } catch (error) {
        if (error instanceof GlitchError) {
            console.error(`Failed to create chaos request: ${error.message}`);
            process.exit(1);
        }
        console.error('Unexpected error:', error);
        process.exit(1);
    }
});

program
  .command('version')
  .description('Print version')
  .action(() => {
    console.log(pkg.version);
  });

program.parse(process.argv);
