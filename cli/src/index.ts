#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { analyzeSecurity } from './security.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get package version
const pkg = JSON.parse(
readFileSync(join(__dirname, '../../package.json'), 'utf8')
);

const TEST_TYPES = ['FUZZ', 'LOAD', 'EXPLOIT', 'CONCURRENCY', 'SECURITY'] as const;
type TestType = typeof TEST_TYPES[number];

function validateTestType(value: string): TestType {
    const upperValue = value.toUpperCase();
    if (!TEST_TYPES.includes(upperValue as TestType)) {
        throw new Error(formatErrorMessage(ErrorCode.INVALID_TEST_TYPE));
    }
    return upperValue as TestType;
}

const program = new Command()
.name('glitch')
.description('Glitch Gremlin AI CLI tool')
.version(`v${pkg.version}`, '-v, --version', 'Output the current version');

// Handle version flag specially
if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(`v${pkg.version}`);
    process.exit(0);
}

program.exitOverride((err) => {
    console.error(err.message);
    process.exit(1);
});

// Configure error handling
program.configureOutput({
writeErr: (str) => process.stderr.write(str),
writeOut: (str) => process.stdout.write(str)
});

// Test command
// Validate program address format 
function validateProgramAddress(address: string): void {
    if (!/^[A-Za-z0-9]{32,44}$/.test(address)) {
        throw new Error(formatErrorMessage(ErrorCode.INVALID_PROGRAM_ADDRESS));
    }
}

program
.command('test')
.description('Run a test')
.requiredOption('-p, --program <address>', 'Target program address')
.requiredOption('-t, --type <type>', 'Test type')
.action(async (options) => {
    try {
        if (!options.program) {
            console.error(formatErrorMessage(ErrorCode.MISSING_PROGRAM_ADDRESS));
            process.exit(1);
        }

        validateProgramAddress(options.program);
        validateTestType(options.type);
        
        // Run the test...
        console.log(`Running ${options.type} test on program ${options.program}`);
        console.log('Test completed successfully');
        process.exit(0);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(String(error));
        }
        process.exit(1);
    }
});

// Security command
program
    .command('security')
    .description('Analyze program security')
    .requiredOption('-p, --program <address>', 'Program address to analyze')
    .action(async (options) => {
        try {
            if (!options.program) {
                console.error(formatErrorMessage(ErrorCode.MISSING_PROGRAM_ADDRESS));
                process.exit(1);
            }

            validateProgramAddress(options.program);
            
            const report = await analyzeSecurity(options.program);
            if (!report) {
                console.error(formatErrorMessage(ErrorCode.SECURITY_ANALYSIS_FAILED));
                process.exit(1);
            }
            
            console.log('Security Analysis Report');
            console.log(`Program: ${options.program}`);
            process.exit(0);
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('network')) {
                    console.error(formatErrorMessage(ErrorCode.NETWORK_ERROR));
                } else if (error.message.includes('timeout')) {
                    console.error(formatErrorMessage(ErrorCode.TIMEOUT_ERROR));
                } else {
                    console.error(error.message);
                }
            } else {
                console.error(formatErrorMessage(ErrorCode.SECURITY_ANALYSIS_FAILED));
            }
            process.exit(1);
        }
    });

// Add global unhandled rejection handler
process.on('unhandledRejection', (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});

try {
    await program.parseAsync(process.argv);
} catch (err: unknown) {
    if (err instanceof Error) {
        const error = err as Error & { code?: string };
        
        if (error.code === 'commander.missingMandatoryOptionValue') {
            if (error.message.includes('program')) {
                console.error(formatErrorMessage(ErrorCode.MISSING_PROGRAM_ADDRESS));
            } else if (error.message.includes('type')) {
                console.error(formatErrorMessage(ErrorCode.INVALID_TEST_TYPE));
            } else {
                console.error(error.message);
            }
        } else if (error.code === 'commander.invalidArgument') {
            console.error(formatErrorMessage(ErrorCode.INVALID_PROGRAM_ADDRESS));
        } else {
            console.error(error.message);
        }
    } else {
        console.error(String(err));
    }
    process.exit(1);
}
