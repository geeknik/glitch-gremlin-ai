import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../../utils/logger';
import { ChaosTestParams } from '../types';

interface TestResult {
    success: boolean;
    proof?: string;
    error?: string;
}

export class ZkVMExecutor {
    private logger: Logger;
    private env: NodeJS.ProcessEnv;

    constructor(logger?: Logger, env?: NodeJS.ProcessEnv) {
        this.logger = logger || console;
        this.env = env || process.env;
    }

    async executeTest(program: string, params: ChaosTestParams): Promise<TestResult> {
        try {
            const result = await this.runInZkVM(program, params);
            if (!result.success) {
                throw new Error(result.error || 'zkVM execution failed');
            }
            
            const proof = await this.generateProof();
            return {
                success: true,
                proof
            };
        } catch (error) {
            this.logger.error('zkVM execution failed:', error);
            throw error;
        }
    }

    private async runInZkVM(program: string, params: ChaosTestParams): Promise<TestResult> {
        return new Promise((resolve, reject) => {
            const zkProcess = spawn('cargo', ['nexus', 'run'], {
                env: {
                    ...this.env,
                    NEXUS_PROGRAM: program,
                    NEXUS_PARAMS: JSON.stringify(params)
                }
            });

            let output = '';
            
            zkProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            zkProcess.on('error', (error) => {
                reject(new Error(`zkVM process error: ${error.message}`));
            });

            zkProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('zkVM execution failed'));
                    return;
                }

                try {
                    const result = JSON.parse(output);
                    resolve({
                        success: true,
                        ...result
                    });
                } catch (error) {
                    reject(new Error('Invalid zkVM output'));
                }
            });
        });
    }

    private async generateProof(): Promise<string> {
        return new Promise((resolve, reject) => {
            const proofProcess = spawn('cargo', ['nexus', 'prove'], {
                env: this.env
            });

            proofProcess.on('error', (error) => {
                reject(new Error(`Proof generation error: ${error.message}`));
            });

            proofProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('Proof generation failed'));
                    return;
                }
                resolve('nexus-proof');
            });
        });
    }
}
