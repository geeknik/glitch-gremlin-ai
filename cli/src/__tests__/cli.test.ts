import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// Helper function to resolve paths from test root
const fromRoot = (...paths: string[]) => {
    return resolve(__dirname, '..', ...paths);
};

// Constants 
const CLI_PATH = fromRoot('../../src/index.ts');
const PACKAGE_JSON = fromRoot('package.json');

// Helper to execute CLI commands
const runCLI = (args: string[] = []) => {
    const result = spawnSync('node', [
        '--loader=ts-node/esm',
        '--experimental-vm-modules',
        '--no-warnings',
        CLI_PATH,
        ...args
    ], {
        env: {
            ...process.env,
            NODE_ENV: 'test',
            DEBUG: 'false',
            NO_COLOR: 'true'
        },
        encoding: 'utf8',
        stdio: 'pipe'
    });
    
    // Normalize line endings for consistent testing
    if (result.stdout) result.stdout = result.stdout.replace(/\r\n/g, '\n');
    if (result.stderr) result.stderr = result.stderr.replace(/\r\n/g, '\n');
    
    return result;
};

// Read CLI package.json for version
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
const VERSION = pkg.version;

describe('CLI', () => {
    describe('Version Command', () => {
        it('should display version', () => {
            const result = runCLI(['--version']);
            
            // Check if CLI executed successfully
            if (result.status !== 0) {
                console.error('CLI Error:', result.stderr);
            }
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(VERSION);
        });
    });

    describe('Test Command', () => {
        describe('Parameter Validation', () => {
            it('should validate test type parameter', () => {
                const result = runCLI([
                    'test',
                    '--program', '11111111111111111111111111111111',
                    '--type', 'INVALID_TYPE'
                ]);
                
                expect(result.stderr).toContain('Error');
                expect(result.status).not.toBe(0);
            });

            it('should require program address', () => {
                const result = runCLI([
                    'test',
                    '--type', 'FUZZ'
                ]);
                
                expect(result.status).not.toBe(0);
                if (!result.stderr.includes('error: required option \'--program\' not specified')) {
                    console.error('Unexpected error:', result.stderr);
                }
                expect(result.stderr).toContain('error: required option \'--program\' not specified');
            });
        });
    });
});
