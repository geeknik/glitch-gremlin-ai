import { GlitchSDK } from './sdk.js.js';
import { Command } from 'commander.js';
import { readPackageJson } from './utils.js.js';

const program = new Command();

const pkg = readPackageJson();

program
  .version(pkg.version)
  .command('create-chaos-request')
  .description('Create a chaos request')
  .action(async () => {
    const sdk = await GlitchSDK.init({
        cluster: 'devnet',
        wallet: Keypair.generate()
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
