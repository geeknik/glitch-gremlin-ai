import { spawnSync } from 'child_process';
import { join, resolve } from 'path';
import { readFileSync } from 'fs';

// Helper function to resolve paths from test root
const fromRoot = (...paths: string[]) => resolve(__dirname, '../..', ...paths);

// Constants 
const CLI_PATH = fromRoot('dist/index.js');
const PACKAGE_JSON = fromRoot('package.json');

// Helper to execute CLI commands
const runCLI = (args: string[] = []) => spawnSync('node', [
    '--experimental-vm-modules',
    '--no-warnings',
    '--es-module-specifier-resolution=node',
    CLI_PATH,
    ...args
], {
    env: { 
        ...process.env,
        NODE_ENV: 'test',
        DEBUG: 'false'
    },
    encoding: 'utf8',
    stdio: 'pipe',
    shell: true
});

// Read package.json for version
const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
const VERSION = pkg.version;

describe('CLI', () => {
    describe('Version Command', () => {
        it('should display version', () => {
            const result = runCLI(['--version']);
            
            // Check if CLI executed successfully
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
                expect(result.stderr).toContain('error: required option \'--program <address>\' not specified');
            });
        });
    });
});
