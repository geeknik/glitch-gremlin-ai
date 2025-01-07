import { GlitchSDK } from './sdk.js';
import { Command } from 'commander';
import { readPackageJson } from './utils.js';

const program = new Command();

const pkg = readPackageJson();

program
  .version(pkg.version)
  .command('create-chaos-request')
  .description('Create a chaos request')
  .action(async () => {
    const sdk = await GlitchSDK.init({
        cluster: 'devnet',
        wallet: new Keypair()
    });
    // Add chaos request creation logic
  });

program
  .command('version')
  .description('Print version')
  .action(() => {
    console.log(pkg.version);
  });

program.parse(process.argv);
