import { GlitchSDK } from './sdk';
import { program } from 'commander';
import { readPackageJson } from './utils';

const pkg = readPackageJson();

program
  .version(pkg.version)
  .command('create-chaos-request')
  .description('Create a chaos request')
  .action(async () => {
    const sdk = new GlitchSDK();
    // Add chaos request creation logic
  });

program.parse(process.argv);
