import { ZkVMExecutor } from '../zkvm/executor';
import { spawn } from 'child_process';
import { Logger } from '../utils/logger';

// Mock child_process
jest.mock('child_process', () => ({
spawn: jest.fn()
}));

// Mock logger with required methods
jest.mock('../utils/logger', () => ({
Logger: jest.fn().mockImplementation(() => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}))
}));

describe('ZkVMExecutor', () => {
let executor: ZkVMExecutor;
let mockSpawn: jest.Mock;
let mockProcess: any;

beforeEach(() => {
    jest.clearAllMocks();

    mockProcess = {
    stdout: {
        on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'data') {
            cb(Buffer.from(JSON.stringify({ success: true })));
        }
        })
    },
    stderr: {
        on: jest.fn()
    },
    on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
        cb(0);
        }
    })
    };

    mockSpawn = jest.fn().mockReturnValue(mockProcess);
    (spawn as jest.Mock) = mockSpawn;

    executor = new ZkVMExecutor();
});

describe('executeTest', () => {
    it('should execute test in zkVM environment', async () => {
    const result = await executor.executeTest('test-program', {
        type: 'FUZZ',
        params: {}
    });

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
        'cargo',
        ['nexus', 'run'],
        expect.any(Object)
    );
    });

    it('should handle zkVM execution failures', async () => {
    mockProcess.on = jest.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
        cb(1);
        }
    });

    await expect(executor.executeTest('test-program', {
        type: 'FUZZ',
        params: {}
    })).rejects.toThrow('zkVM execution failed');
    });

    it('should handle stderr output', async () => {
    mockProcess.stderr.on = jest.fn().mockImplementation((event, cb) => {
        if (event === 'data') {
        cb(Buffer.from('Error in zkVM execution'));
        }
    });
    mockProcess.on = jest.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
        cb(1);
        }
    });

    await expect(executor.executeTest('test-program', {
        type: 'FUZZ',
        params: {}
    })).rejects.toThrow('zkVM execution failed');
    });
});

describe('proof generation', () => {
    it('should generate valid proof', async () => {
    mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ proof: 'valid-proof' })));
        }
    });

    const result = await executor['generateProof']();
    expect(result).toBeDefined();
    });

    it('should handle proof generation failures', async () => {
    mockProcess.on = jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
        callback(1);
        }
    });

    await expect(executor['generateProof']())
        .rejects.toThrow('Proof generation failed');
    });
});
});
