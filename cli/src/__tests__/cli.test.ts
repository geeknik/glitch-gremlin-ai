import { spawnSync } from 'child_process';
import { join } from 'path';
import { version } from '../../package.json';

const CLI_PATH = join(__dirname, '../../dist/index.js');

describe('CLI', () => {
    it('should display version', () => {
        const result = spawnSync('node', [CLI_PATH, '--version']);
        expect(result.stdout.toString().trim()).toBe(version);
    });

    it('should validate test parameters', () => {
        const result = spawnSync('node', [
            CLI_PATH,
            'test',
            '--program', '11111111111111111111111111111111',
            '--type', 'INVALID_TYPE'
        ]);
        expect(result.stderr.toString()).toContain('Error');
    });

    it('should require program address for test command', () => {
        const result = spawnSync('node', [
            CLI_PATH,
            'test',
            '--type', 'FUZZ'
        ], {
            env: {} // Clear environment to avoid any existing SOLANA_KEYPAIR_PATH
        });
        expect(result.status).not.toBe(0);
        if (result.stderr) {
            expect(result.stderr.toString()).toContain('program');
        }
    });
});
