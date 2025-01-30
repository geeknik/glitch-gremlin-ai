import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { FuzzingMutation, FuzzingResult, FuzzingMetrics } from './types.js';
import { VulnerabilityType } from '../../types.js';

export class ChaosTester {
    private connection: Connection;
    private programId: PublicKey;
    private metrics: FuzzingMetrics;

    constructor(connection: Connection, programId: string) {
        this.connection = connection;
        this.programId = new PublicKey(programId);
        this.metrics = this.initializeMetrics();
    }

    private initializeMetrics(): FuzzingMetrics {
        return {
            coverage: 0,
            uniquePaths: 0,
            executionTime: 0,
            memoryUsage: 0,
            cpuUtilization: 0,
            networkLatency: 0,
            errorRate: 0,
            vulnerabilitiesFound: 0,
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0
        };
    }

    async testScenario(mutation: FuzzingMutation): Promise<FuzzingResult> {
        const startTime = Date.now();
        const vulnerabilities: VulnerabilityType[] = [];
        
        try {
            // Create and send test transaction
            const result = await this.executeTestTransaction(mutation);
            
            // Analyze results for vulnerabilities
            const detectedVulnerabilities = await this.analyzeTransactionResult(result);
            vulnerabilities.push(...detectedVulnerabilities);

            // Update metrics
            this.updateMetrics({
                executionTime: Date.now() - startTime,
                success: true
            });

            return {
                success: vulnerabilities.length === 0,
                vulnerabilities,
                metrics: this.metrics,
                mutations: [mutation],
                duration: Date.now() - startTime,
                coverage: this.metrics.coverage,
                timestamp: Date.now()
            };

        } catch (error) {
            // Update error metrics
            this.updateMetrics({
                executionTime: Date.now() - startTime,
                success: false
            });

            throw new Error(`Test scenario failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async executeTestTransaction(mutation: FuzzingMutation): Promise<any> {
        const transaction = new Transaction();
        
        // Add test instruction based on mutation type
        const instruction = this.createTestInstruction(mutation);
        transaction.add(instruction);

        // Send and confirm transaction
        const result = await this.connection.simulateTransaction(transaction);
        
        return result;
    }

    private createTestInstruction(mutation: FuzzingMutation): any {
        // Create instruction based on mutation type
        switch (mutation.type) {
            case 'ARITHMETIC':
                return this.createArithmeticTestInstruction(mutation);
            case 'ACCESS_CONTROL':
                return this.createAccessControlTestInstruction(mutation);
            case 'REENTRANCY':
                return this.createReentrancyTestInstruction(mutation);
            case 'PDA':
                return this.createPDATestInstruction(mutation);
            case 'CONCURRENCY':
                return this.createConcurrencyTestInstruction(mutation);
            default:
                throw new Error(`Unsupported mutation type: ${mutation.type}`);
        }
    }

    private async analyzeTransactionResult(result: any): Promise<VulnerabilityType[]> {
        const vulnerabilities: VulnerabilityType[] = [];

        // Analyze logs for potential vulnerabilities
        if (result.logs) {
            for (const log of result.logs) {
                if (log.includes('overflow') || log.includes('underflow')) {
                    vulnerabilities.push(VulnerabilityType.ARITHMETIC_OVERFLOW);
                }
                if (log.includes('unauthorized') || log.includes('permission denied')) {
                    vulnerabilities.push(VulnerabilityType.ACCESS_CONTROL);
                }
                if (log.includes('reentrancy') || log.includes('recursive call')) {
                    vulnerabilities.push(VulnerabilityType.REENTRANCY);
                }
                if (log.includes('invalid PDA') || log.includes('seed mismatch')) {
                    vulnerabilities.push(VulnerabilityType.PDA_VALIDATION);
                }
            }
        }

        return vulnerabilities;
    }

    private updateMetrics(data: { executionTime: number; success: boolean }): void {
        this.metrics.totalExecutions++;
        this.metrics.executionTime += data.executionTime;
        
        if (data.success) {
            this.metrics.successfulExecutions++;
        } else {
            this.metrics.failedExecutions++;
            this.metrics.errorRate = this.metrics.failedExecutions / this.metrics.totalExecutions;
        }
    }

    private createArithmeticTestInstruction(mutation: FuzzingMutation): any {
        // Create instruction to test arithmetic operations
        return {
            programId: this.programId,
            keys: [],
            data: mutation.data
        };
    }

    private createAccessControlTestInstruction(mutation: FuzzingMutation): any {
        // Create instruction to test access control
        return {
            programId: this.programId,
            keys: [],
            data: mutation.data
        };
    }

    private createReentrancyTestInstruction(mutation: FuzzingMutation): any {
        // Create instruction to test reentrancy
        return {
            programId: this.programId,
            keys: [],
            data: mutation.data
        };
    }

    private createPDATestInstruction(mutation: FuzzingMutation): any {
        // Create instruction to test PDA validation
        return {
            programId: this.programId,
            keys: [],
            data: mutation.data
        };
    }

    private createConcurrencyTestInstruction(mutation: FuzzingMutation): any {
        // Create instruction to test concurrency issues
        return {
            programId: this.programId,
            keys: [],
            data: mutation.data
        };
    }
} 