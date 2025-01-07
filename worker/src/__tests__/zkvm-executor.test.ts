import { ZkVMExecutor } from '../zkvm/executor';
import { spawn } from 'child_process';
import { Logger } from '../../utils/logger';

jest.mock('child_process');
jest.mock('../utils/logger');

describe('ZkVMExecutor', () => {
    let executor: ZkVMExecutor;
    let mockSpawn: jest.SpyInstance;

    beforeEach(() => {
        executor = new ZkVMExecutor();
        mockSpawn = jest.spyOn(require('child_process'), 'spawn');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('executeTest', () => {
        it('should execute test in zkVM environment', async () => {
            const mockProcess = {
                stdout: { on: jest.fn() },
                on: jest.fn()
            };

            // Mock successful execution
            mockProcess.stdout.on.mockImplementation((event, callback) => {
                if (event === 'data') {
                    callback(JSON.stringify({ success: true }));
                }
            });

            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(0);
                }
            });

            mockSpawn.mockReturnValue(mockProcess);

            const result = await executor.executeTest('test-program', {
                type: 'FUZZ',
                params: {}
            });

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();
            expect(mockSpawn).toHaveBeenCalledWith('cargo', ['nexus', 'run'], expect.any(Object));
        });

        it('should handle zkVM execution failures', async () => {
            const mockProcess = {
                stdout: { on: jest.fn() },
                on: jest.fn()
            };

            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(1); // Error exit code
                }
            });

            mockSpawn.mockReturnValue(mockProcess);

            await expect(executor.executeTest('test-program', {
                type: 'FUZZ',
                params: {}
            })).rejects.toThrow('zkVM execution failed');
        });
    });

    describe('proof generation', () => {
        it('should generate valid proof', async () => {
            const mockProcess = {
                on: jest.fn()
            };

            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(0);
                }
            });

            mockSpawn.mockReturnValue(mockProcess);

            const result = await executor['generateProof']();
            expect(result).toBe('nexus-proof');
        });

        it('should handle proof generation failures', async () => {
            const mockProcess = {
                on: jest.fn()
            };

            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(1);
                }
            });

            mockSpawn.mockReturnValue(mockProcess);

            await expect(executor['generateProof']())
                .rejects.toThrow('Proof generation failed');
        });
    });
});
