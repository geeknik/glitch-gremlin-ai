import { resolve } from 'path';
import { readFileSync } from 'fs';
import { runCLI, fromRoot } from './test-helpers';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from '@jest/globals';
import { ErrorCode, formatErrorMessage } from '../utils/errors';

// Constants
const CLI_PATH = fromRoot('../src/index.ts');
const PACKAGE_JSON = resolve(__dirname, '../../package.json');
const VALID_PROGRAM_ADDRESS = '11111111111111111111111111111111';
const VERSION = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).version;

// Test Addresses for Different Error Scenarios
const ERROR_ADDRESS = '22222222222222222222222222222222';
const NETWORK_ERROR_ADDRESS = '33333333333333333333333333333333';
const TIMEOUT_ADDRESS = '44444444444444444444444444444444';

// Global test setup and teardown
const originalConsoleError = console.error;
const originalProcessListeners = {
    SIGINT: process.listeners('SIGINT'),
    unhandledRejection: process.listeners('unhandledRejection')
};
let consoleErrors: string[] = [];

beforeAll(() => {
    // Remove existing listeners
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('unhandledRejection');
    
    // Capture console errors
    console.error = (msg: string) => {
        consoleErrors.push(msg);
    };
});

afterAll(() => {
    // Restore original console.error
    console.error = originalConsoleError;
    
    // Restore original process listeners
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('unhandledRejection');
    originalProcessListeners.SIGINT.forEach(listener => {
        process.on('SIGINT', listener);
    });
    originalProcessListeners.unhandledRejection.forEach(listener => {
        process.on('unhandledRejection', listener);
    });
});

beforeEach(() => {
    consoleErrors = [];
});

// Helper Functions
const expectError = async (command: string[], expectedError: string) => {
    const result = await runCLI(command);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
};

const expectSuccess = async (command: string[], expectedOutput: string) => {
    const result = await runCLI(command);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(expectedOutput);
};

describe('CLI', () => {
    describe('Version Command', () => {
        it('should display version from package.json', async () => {
            const result = await runCLI(['--version']);
            expect(result.status).toBe(0);
            expect(result.stdout.trim()).toBe(`v${VERSION}`);
        });

        it('should handle version flag with other commands', async () => {
            const result = await runCLI(['test', '--version']);
            expect(result.status).toBe(0);
            expect(result.stdout.trim()).toBe(`v${VERSION}`);
        });
    });

    describe('Test Command', () => {
        describe('Parameter Validation', () => {
            it('should require program address', async () => {
                await expectError(
                    ['test'],
                    formatErrorMessage(ErrorCode.MISSING_PROGRAM_ADDRESS)
                );
            });

            it('should validate program address format', async () => {
                await expectError(
                    ['test', '--program', 'invalid-address'],
                    formatErrorMessage(ErrorCode.INVALID_PROGRAM_ADDRESS)
                );
            });

            it('should validate test type parameter', async () => {
                await expectError(
                    ['test', '--program', VALID_PROGRAM_ADDRESS, '--type', 'INVALID_TYPE'],
                    formatErrorMessage(ErrorCode.INVALID_TEST_TYPE)
                );
            });

            it('should accept valid test parameters', async () => {
                await expectSuccess(
                    ['test', '--program', VALID_PROGRAM_ADDRESS, '--type', 'security'],
                    'Test completed successfully'
                );
            });
        });
    });

    describe('Security Command', () => {
        it('should require program address', async () => {
            await expectError(
                ['security'],
                formatErrorMessage(ErrorCode.MISSING_PROGRAM_ADDRESS)
            );
        });

        it('should validate program address format', async () => {
            await expectError(
                ['security', '--program', 'invalid-address'],
                formatErrorMessage(ErrorCode.INVALID_PROGRAM_ADDRESS)
            );
        });

        it('should analyze program security with valid address', async () => {
            await expectSuccess(
                ['security', '--program', VALID_PROGRAM_ADDRESS],
                'Security Analysis Report'
            );
        });

        it('should handle analysis errors gracefully', async () => {
            await expectError(
                ['security', '--program', ERROR_ADDRESS],
                formatErrorMessage(ErrorCode.SECURITY_ANALYSIS_FAILED)
            );
        });

        it('should handle network errors gracefully', async () => {
            await expectError(
                ['security', '--program', NETWORK_ERROR_ADDRESS],
                formatErrorMessage(ErrorCode.NETWORK_ERROR)
            );
        });

        it('should handle timeout errors gracefully', async () => {
            await expectError(
                ['security', '--program', TIMEOUT_ADDRESS],
                formatErrorMessage(ErrorCode.TIMEOUT_ERROR)
            );
        });
    });
});
