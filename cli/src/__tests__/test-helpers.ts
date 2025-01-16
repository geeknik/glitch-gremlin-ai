import { ChildProcess, spawn } from 'child_process';
import { resolve } from 'path';

// Type definitions with clear documentation
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
export const fromRoot = (...paths: string[]): string => {
    return resolve(__dirname, '..', ...paths);  
}

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
    return new Promise((resolve) => {
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

// Helper to execute CLI commands
export const runCLI = async (args: string[] = []): Promise<CLIResult> => {
    const CLI_PATH = fromRoot('cli.ts');
    
    const child = spawn('node', [
        require.resolve('ts-node/dist/bin'),
        '--esm',
        CLI_PATH,
        ...args
    ], {
        env: {
            ...process.env,
            NODE_ENV: 'test',
            DEBUG: 'false',
            NO_COLOR: 'true',
            TS_NODE_PROJECT: resolve(__dirname, '../../tsconfig.json'),
            NODE_OPTIONS: '--loader ts-node/esm --no-warnings',
            FORCE_COLOR: '0'
        },
        stdio: 'pipe'
    });

    const manager = new ProcessManager(child);
    manager.setupOutputHandlers();

    return new Promise((resolve) => {
        manager.setupExitHandler((result) => {
            manager.setResolved();
            resolve(result);
        });

        manager.setupErrorHandler((result) => {
            manager.setResolved();
            resolve(result);
        });

        manager.setupTimeout(10000, (result) => {
            manager.setResolved();
            resolve(result);
        });
    }).finally(() => {
        manager.cleanup();
    });
};
