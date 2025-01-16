#!/usr/bin/env node

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

program
    .command('version')
    .description('Print version')
    .action(() => {
        console.log(pkg.version);
    });

program
    .command('security')
    .description('Security command')
    .argument('<string>', 'Security argument')
    .action((arg) => {
        console.log(`Security argument: ${arg}`);
        // Add security command logic here
    });

program.parse(process.argv);
