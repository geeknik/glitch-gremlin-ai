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
  readFileSync(join(__dirname, '../package.json'), 'utf8')
);

const TEST_TYPES = ['FUZZ', 'LOAD', 'EXPLOIT', 'CONCURRENCY', 'SECURITY'] as const;
type TestType = typeof TEST_TYPES[number];

function validateTestType(value: string): TestType {
const upperValue = value.toUpperCase();
if (!TEST_TYPES.includes(upperValue as TestType)) {
    throw new Error(`Invalid test type. Must be one of: ${TEST_TYPES.join(', ')}`);
}
return upperValue as TestType;
}

const program = new Command();

// Set up basic program info
program
  .name('glitch')
  .description('Glitch Gremlin AI CLI tool')
  .version(pkg.version, '-v, --version', 'Output the current version');

// Configure error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(`Error: ${str}`),
  writeOut: (str) => process.stdout.write(str)
});

// Enable exit override for testing
program.exitOverride();

// Test command
program
.command('test')
.description('Run a test')
.requiredOption('-p, --program <address>', 'Target program address')
.option('-t, --type <type>', 'Test type', validateTestType)
.action((options) => {
    if (!options.program) {
        throw new Error('Required option \'--program\' not specified');
    }

    if (!options.type) {
        throw new Error('Test type is required');
    }

    try {
        validateTestType(options.type);
    } catch (error) {
        throw new Error('Invalid test type. Must be one of: ' + TEST_TYPES.join(', '));
    }

    console.log(`Running ${options.type} test on program ${options.program}`);
});

// Security command
program
    .command('security')
    .description('Analyze program security')
    .requiredOption('-p, --program <address>', 'Program address to analyze')
    .action(async (options) => {
        try {
            console.log('Analyzing program security...');
            const report = await analyzeSecurity(options.program);
            console.log('\n=== Security Analysis Report ===');
            console.log(`\nProgram: ${report.programId}`);
            console.log(`Overall Risk Level: ${report.riskLevel}`);
            
            console.log('\nSummary:');
            console.log(`Total Issues: ${report.summary.totalIssues}`);
            console.log(`Critical: ${report.summary.criticalCount}`);
            console.log(`High: ${report.summary.highCount}`);
            console.log(`Medium: ${report.summary.mediumCount}`);
            console.log(`Low: ${report.summary.lowCount}`);
            
            if (report.vulnerabilities.length > 0) {
                console.log('\nDetected Vulnerabilities:');
                report.vulnerabilities.forEach((vuln, index) => {
                    console.log(`\n${index + 1}. ${vuln.type}`);
                    console.log(`   Severity: ${vuln.severity}`);
                    console.log(`   Confidence: ${(vuln.confidence * 100).toFixed(1)}%`);
                    console.log(`   Description: ${vuln.description}`);
                    
                    if (vuln.location) {
                        console.log(`   Location: ${vuln.location}`);
                    }
                    
                    if (vuln.recommendations?.length) {
                        console.log('   Recommendations:');
                        vuln.recommendations.forEach(rec => {
                            console.log(`   - ${rec}`);
                        });
                    }
                });
            }
            
            console.log('\nScan Metadata:');
            console.log(`Duration: ${report.metadata.scanDuration}ms`);
            console.log(`Program Size: ${report.metadata.programSize} bytes`);
            console.log(`Model Version: ${report.metadata.modelVersion}`);
            console.log(`Timestamp: ${new Date(report.metadata.timestamp).toISOString()}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Error:', message);
            process.exit(1);
        }
    });

try {
    // Parse and handle commands
    await program.parseAsync(process.argv);
} catch (err: unknown) {
    if (err instanceof Error) {
        const error = err as Error & { code?: string };
        if (error.code === 'commander.missingMandatoryOptionValue') {
            console.error('Error: Missing required option:', error.message);
        } else if (error.code === 'commander.invalidOptionValue') {
            console.error('Error: Invalid option value:', error.message);
        } else {
            console.error('Error:', error.message);
        }
    } else {
        console.error('Error:', String(err));
    }
    process.exit(1);
}
