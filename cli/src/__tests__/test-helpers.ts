import { ChildProcess } from 'child_process';
import { jest } from '@jest/globals';

// Type definitions with clear documentation
interface ProcessState {
  processExited: boolean;
  timedOut: boolean;
  isResolved: boolean;
  exitCode: number | null;
}

interface OutputBuffers {
  stdout: string;
  stderr: string;
}

interface CLIResult {
/** Exit status code from the process */
status: number;
/** Standard output content */
stdout: string;
/** Standard error content */ 
stderr: string;
}

/** Options for running CLI commands */
interface CLIOptions {
/** Maximum time to wait for command completion in ms */
timeout?: number;
/** Custom environment variables */
env?: NodeJS.ProcessEnv;
/** Working directory for command execution */
cwd?: string;
}

/** Resolve paths relative to project root */

/** Filter common Node.js warnings from output */
export const filterOutput = (output: string): string => {
const warnings = [
    'ExperimentalWarning',
    'DeprecationWarning', 
    'NO_COLOR',
    '--trace-warnings',
    '--trace-deprecation',
    '--experimental-loader',
    '--experimental-vm-modules',
    '--experimentalResolver',
    'fs.Stats constructor is deprecated',
    'Type Stripping is an experimental feature',
    '(Use `node'
];

return output
    .split('\n')
    .filter(line => {
    const normalized = line.trim();
    return normalized !== '' && !warnings.some(w => normalized.includes(w));
    })
    .join('\n')
    .trim();
}

/** Class to manage CLI process execution and cleanup */
class ProcessResult {
private readonly process: ChildProcess;
private readonly stdout: string[] = [];
private readonly stderr: string[] = [];
private exitCode: number | null = null;
private readonly timeoutMs: number;
private timeoutHandle?: NodeJS.Timeout;

constructor(process: ChildProcess, timeoutMs: number = 5000) {
    this.process = process;
    this.timeoutMs = timeoutMs;
    this.setupOutputCapture();
}

/** Set up output capture streams */
private setupOutputCapture(): void {
    this.process.stdout?.on('data', (data) => this.stdout.push(data.toString()));
    this.process.stderr?.on('data', (data) => this.stderr.push(data.toString()));
}

/** Wait for process completion with timeout */
public async wait(): Promise<CLIResult> {
    return new Promise<CLIResult>((resolve) => {
    // Set timeout handler
    this.timeoutHandle = setTimeout(() => {
        this.kill();
        resolve(this.buildResult(1, 'Command timed out'));
    }, this.timeoutMs);

    // Handle process completion
    this.process.once('exit', (code) => {
        this.exitCode = code ?? 1;
        if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        }
        resolve(this.buildResult(this.exitCode));
    });

    // Handle process errors
    this.process.once('error', (err) => {
        if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        }
        resolve(this.buildResult(1, err.message));
    });
    });
}

/** Build the final result object */
private buildResult(status: number, error?: string): CLIResult {
    const stderr = error ? [error] : this.stderr;
    return {
    status,
    stdout: filterOutput(this.stdout.join('')),
    stderr: filterOutput(stderr.join(''))
    };
}

/** Kill the process if still running */
private kill(): void {
    if (!this.process.killed) {
    this.process.kill();
    }
}
}


class ProcessManager {
private child: ChildProcess;
private state: ProcessState;
private buffers: OutputBuffers;
private timeoutId: NodeJS.Timeout | null;
private readonly maxListeners = 10;

constructor(child: ChildProcess) {
    this.child = child;
    this.state = {
    processExited: false,
    timedOut: false,
    isResolved: false,
    exitCode: null
    };
    this.buffers = {
    stdout: '',
    stderr: ''
    };
    this.timeoutId = null;

    // Increase limit if needed
    if (process.listenerCount('SIGINT') >= this.maxListeners) {
    process.setMaxListeners(process.listenerCount('SIGINT') + 1);
    }
    if (process.listenerCount('unhandledRejection') >= this.maxListeners) {
    process.setMaxListeners(process.listenerCount('unhandledRejection') + 1);
    }
}

public setupOutputHandlers(): void {
    this.child.stdout?.on('data', (data: Buffer) => {
    this.buffers.stdout += data.toString();
    });

    this.child.stderr?.on('data', (data: Buffer) => {
    this.buffers.stderr += data.toString();
    });
}

public setupErrorHandler(handleResult: (result: CLIResult) => void): void {
    this.child.on('error', (error: Error) => {
    handleResult({
        status: 1,
        stdout: '',
        stderr: error.message
    });
    });
}

public setupExitHandler(handleResult: (result: CLIResult) => void): void {
    this.child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    this.state.processExited = true;
    this.state.exitCode = code;

    if (!this.state.timedOut) {
        if (signal) {
        handleResult({
            status: 1,
            stdout: filterOutput(this.buffers.stdout),
            stderr: `Process terminated by signal ${signal}`
        });
        } else {
        handleResult({
            status: code ?? 1,
            stdout: filterOutput(this.buffers.stdout),
            stderr: filterOutput(this.buffers.stderr)
        });
        }
    }
    });
}

public setupTimeout(timeout: number, handleResult: (result: CLIResult) => void): void {
    this.timeoutId = setTimeout(() => {
    this.state.timedOut = true;
    handleResult({
        status: 1,
        stdout: filterOutput(this.buffers.stdout),
        stderr: `Command timed out after ${timeout}ms`
    });
    }, timeout);
}

public cleanup(): void {
    if (this.timeoutId) {
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
    }

    if (this.child && !this.child.killed) {
    this.child.kill('SIGTERM');
    this.child.removeAllListeners();
    }

    process.removeAllListeners('SIGINT');
    process.removeAllListeners('unhandledRejection');

    // Reset maxListeners
    process.setMaxListeners(this.maxListeners);
}

public isResolved(): boolean {
    return this.state.isResolved;
}

public setResolved(): void {
    this.state.isResolved = true;
}
}

import { execa } from 'execa';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export async function runCLI(args: string[] = []): Promise<{
    status: number;
    stdout: string;
    stderr: string;
}> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = resolve(__filename, '..');
    const cliPath = resolve(__dirname, '../../src/index.ts');
    
    const result = await execa('tsx', [cliPath, ...args], {
        reject: false,
        env: {
            NODE_ENV: 'test'
        }
    });

    return {
        status: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr
    };
}

export const fromRoot = (...paths: string[]): string => 
    resolve(__dirname, '../..', ...paths);
