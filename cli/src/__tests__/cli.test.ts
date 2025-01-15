import { spawnSync } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

// Constants
const PROJECT_ROOT = process.cwd();
const CLI_ROOT = join(PROJECT_ROOT, 'cli');
const CLI_PATH = join(CLI_ROOT, 'dist/index.js');
const CLI_PACKAGE_JSON = join(CLI_ROOT, 'package.json');

// Read CLI package.json for version
const cliPackageJson = JSON.parse(
readFileSync(CLI_PACKAGE_JSON, 'utf8')
);
const version = cliPackageJson.version;

describe('CLI', () => {
beforeAll(() => {
    // Debug logging for test setup
    console.log('Test Setup:');
    console.log('CLI Path:', CLI_PATH);
    console.log('Package Version:', version);
});

describe('Version Command', () => {
    it('should display version', () => {
    // Execute CLI with --version flag
    const result = spawnSync('node', ['--experimental-vm-modules', '--no-warnings', CLI_PATH, '--version'], {
        env: { ...process.env },
        encoding: 'utf8',
        stdio: 'pipe'
    });

    // Enhanced error handling
    if (result.error) {
        console.error('Error executing CLI:', result.error);
        throw result.error;
    }

    if (result.status !== 0) {
        console.error('CLI exited with status:', result.status);
        console.error('stderr:', result.stderr);
        throw new Error(`CLI failed with status ${result.status}`);
    }

    // Capture and trim output
    const stdout = result.stdout.trim();

    // Debug logging
    console.log('Version Test Results:');
    console.log('CLI output:', stdout);
    console.log('Expected:', version);
    console.log('Output length:', stdout.length);
    console.log('Expected length:', version.length);

    // Assert version matches
    expect(stdout).toBe(version);
    });
});

describe('Test Command', () => {
    describe('Parameter Validation', () => {
    it('should validate test type parameter', () => {
        const result = spawnSync('node', [
        '--experimental-vm-modules',
        '--no-warnings',
        CLI_PATH,
        'test',
        '--program', '11111111111111111111111111111111',
        '--type', 'INVALID_TYPE'
        ], {
        encoding: 'utf8',
        stdio: 'pipe'
        });

        expect(result.stderr).toContain('Error');
        expect(result.status).not.toBe(0);
    });

    it('should require program address', () => {
        const result = spawnSync('node', [
        '--experimental-vm-modules',
        '--no-warnings',
        CLI_PATH,
        'test',
        '--type', 'FUZZ'
        ], {
        env: {}, // Clear environment variables
        encoding: 'utf8',
        stdio: 'pipe'
        });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('program');
    });
    });
});
});
