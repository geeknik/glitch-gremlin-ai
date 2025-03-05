import { VulnerabilityType, FuzzingResult, FuzzingMetrics, VulnerabilityInfo, SecurityLevel, FuzzingConfig as BaseFuzzConfig, FuzzingMutation } from '../types.js';
import { VulnerabilityAnalysis } from './types.js';
import { ChaosGenerator, ChaosConfig, ChaosResult } from './src/chaosGenerator.js';
import { MetricsCollector } from '../metrics/collector.js';
import { Logger } from '../utils/logger.js';
import { Worker } from 'worker_threads';
import { createHash } from 'crypto';
import { cpus } from 'os';

export interface FuzzConfig extends Partial<BaseFuzzConfig> {
    targetProgram: string;
    maxIterations: number;
    timeoutMs: number;
    mutationRate: number;
    crossoverRate: number;
    populationSize: number;
    selectionPressure: number;
    targetVulnerabilities: VulnerabilityType[];
    maxAccounts: number;
    maxDataSize: number;
    maxSeeds: number;
}

export interface FuzzInput {
    programId: string;
    accounts: string[];
    data: Buffer;
    seeds: Buffer[];
}

interface FuzzResult {
    input: FuzzInput;
    vulnerabilities: VulnerabilityInfo[];
    metrics: FuzzingMetrics;
    transactions: Array<{
        signature: string;
        result: string;
    }>;
}

// Optimized Bloom filter for duplicate detection
class BloomFilter {
    private readonly bits: Uint8Array;
    private readonly hashFunctions: number;
    
    constructor(size: number, hashFunctions: number) {
        this.bits = new Uint8Array(Math.ceil(size / 8));
        this.hashFunctions = hashFunctions;
    }

    private hash(value: Buffer, seed: number): number {
        const hash = createHash('sha256')
            .update(value)
            .update(Buffer.from([seed]))
            .digest();
        return parseInt(hash.slice(0, 4).toString('hex'), 16) % (this.bits.length * 8);
    }

    add(value: Buffer): void {
        for (let i = 0; i < this.hashFunctions; i++) {
            const pos = this.hash(value, i);
            this.bits[Math.floor(pos / 8)] |= 1 << (pos % 8);
        }
    }

    test(value: Buffer): boolean {
        for (let i = 0; i < this.hashFunctions; i++) {
            const pos = this.hash(value, i);
            if (!(this.bits[Math.floor(pos / 8)] & (1 << (pos % 8)))) {
                return false;
            }
        }
        return true;
    }
}

export class Fuzzer {
    private readonly config: FuzzConfig;
    private readonly metricsCollector: MetricsCollector;
    private readonly bloomFilter: BloomFilter;
    private readonly workers: Worker[];
    private readonly workerCount: number;
    private adaptiveMutationRate: number;

    constructor(config: FuzzConfig) {
        this.config = config;
        this.metricsCollector = new MetricsCollector();
        this.bloomFilter = new BloomFilter(1024 * 1024, 7); // 1MB filter with 7 hash functions
        this.workerCount = Math.max(1, cpus().length - 1); // Leave one CPU for main thread
        this.workers = this.initializeWorkers();
        this.adaptiveMutationRate = config.mutationRate;
    }

    private initializeWorkers(): Worker[] {
        const workers: Worker[] = [];
        for (let i = 0; i < this.workerCount; i++) {
            const worker = new Worker(`
                const { parentPort } = require('worker_threads');
                const { createHash } = require('crypto');

                parentPort.on('message', async (input) => {
                    try {
                        const result = await fuzzWorker(input);
                        parentPort.postMessage({ type: 'result', data: result });
                    } catch (error) {
                        parentPort.postMessage({ type: 'error', error: error.message });
                    }
                });

                async function fuzzWorker(input) {
                    // Worker-specific fuzzing logic
                    const vulnerabilities = [];
                    
                    // Check for arithmetic overflow
                    if (detectArithmeticOverflow(input.data)) {
                        vulnerabilities.push({
                            id: \`VULN-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`,
                            name: 'Arithmetic Overflow',
                            description: 'Potential arithmetic overflow detected',
                            severity: 'HIGH',
                            confidence: 0.9,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            evidence: [input.data.toString('hex')],
                            recommendation: 'Use checked math operations',
                            vulnerabilityType: 'ARITHMETIC_OVERFLOW',
                            details: {
                                location: input.data.toString('hex'),
                                impact: 'High',
                                likelihood: 'Likely'
                            }
                        });
                    }

                    // Check for access control issues
                    if (detectAccessControlIssue(input.accounts)) {
                        vulnerabilities.push({
                            id: \`VULN-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`,
                            name: 'Access Control',
                            description: 'Potential access control vulnerability',
                            severity: 'CRITICAL',
                            confidence: 0.85,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            evidence: [JSON.stringify(input.accounts)],
                            recommendation: 'Implement proper authorization checks',
                            vulnerabilityType: 'ACCESS_CONTROL',
                            details: {
                                location: 'Account validation',
                                impact: 'Critical',
                                likelihood: 'Likely'
                            }
                        });
                    }

                    return { vulnerabilities };
                }

                function detectArithmeticOverflow(data) {
                    // Optimized arithmetic overflow detection using TypedArrays
                    const view = new DataView(data.buffer);
                    let hasOverflow = false;
                    
                    for (let i = 0; i < data.length - 3; i++) {
                        const value = view.getUint32(i, true);
                        if (value === 0xFFFFFFFF) {
                            hasOverflow = true;
                            break;
                        }
                    }
                    
                    return hasOverflow;
                }

                function detectAccessControlIssue(accounts) {
                    // Check for common access control patterns
                    const accountSet = new Set(accounts);
                    return accountSet.size !== accounts.length;
                }
            `);
            workers.push(worker);
        }
        return workers;
    }

    private async distributeFuzzingTasks(input: FuzzInput): Promise<FuzzResult[]> {
        const tasks = Array.from({ length: this.config.populationSize }, () => this.mutateInput(input));
        const results: FuzzResult[] = [];
        
        for (let i = 0; i < tasks.length; i += this.workerCount) {
            const batch = tasks.slice(i, i + this.workerCount);
            const batchPromises = batch.map((task, index) => {
                return new Promise<FuzzResult>((resolve, reject) => {
                    this.workers[index].postMessage(task);
                    this.workers[index].once('message', (result) => {
                        if (result.type === 'error') {
                            reject(new Error(result.error));
                        } else {
                            resolve(result.data);
                        }
                    });
                });
            });
            results.push(...(await Promise.all(batchPromises)));
        }
        
        return results;
    }

    private mutateInput(input: FuzzInput): FuzzInput {
        // Use TypedArray for efficient mutations
        const data = new Uint8Array(input.data);
        const mutatedData = new Uint8Array(data.length);
        
        // Fast bit manipulation for mutation
        for (let i = 0; i < data.length; i++) {
            if (Math.random() < this.adaptiveMutationRate) {
                mutatedData[i] = data[i] ^ (1 << Math.floor(Math.random() * 8));
            } else {
                mutatedData[i] = data[i];
            }
        }

        return {
            ...input,
            data: Buffer.from(mutatedData),
            accounts: this.mutateAccounts(input.accounts),
            seeds: this.mutateSeeds(input.seeds)
        };
    }

    private mutateAccounts(accounts: string[]): string[] {
        return accounts.map(account => 
            Math.random() < this.adaptiveMutationRate
                ? Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
                : account
        );
    }

    private mutateSeeds(seeds: Buffer[]): Buffer[] {
        return seeds.map(seed => {
            if (Math.random() < this.adaptiveMutationRate) {
                const newSeed = Buffer.alloc(seed.length);
                for (let i = 0; i < seed.length; i++) {
                    newSeed[i] = seed[i] ^ (1 << Math.floor(Math.random() * 8));
                }
                return newSeed;
            }
            return seed;
        });
    }

    private updateAdaptiveMutationRate(successRate: number): void {
        // Adjust mutation rate based on success rate
        const targetSuccessRate = 0.2; // 20% success rate is optimal
        const adjustmentFactor = 0.1;
        
        if (successRate > targetSuccessRate) {
            this.adaptiveMutationRate *= (1 + adjustmentFactor);
        } else {
            this.adaptiveMutationRate *= (1 - adjustmentFactor);
        }
        
        // Keep mutation rate within bounds
        this.adaptiveMutationRate = Math.max(0.01, Math.min(0.5, this.adaptiveMutationRate));
    }

    public async fuzz(input: FuzzInput): Promise<FuzzResult> {
        const startTime = Date.now();
        let iterationCount = 0;
        let uniqueInputsCount = 0;
        let totalSuccessfulMutations = 0;
        const vulnerabilities = new Set<VulnerabilityInfo>();
        const transactions = [];

        while (iterationCount < this.config.maxIterations && 
               Date.now() - startTime < this.config.timeoutMs) {
            
            // Parallel fuzzing using worker pool
            const results = await this.distributeFuzzingTasks(input);
            
            let successfulMutations = 0;
            for (const result of results) {
                const inputHash = createHash('sha256')
                    .update(JSON.stringify(result.input))
                    .digest();
                
                if (!this.bloomFilter.test(inputHash)) {
                    this.bloomFilter.add(inputHash);
                    uniqueInputsCount++;
                    successfulMutations++;
                    totalSuccessfulMutations++;
                    
                    // Add new vulnerabilities
                    result.vulnerabilities.forEach(v => {
                        vulnerabilities.add(v);
                    });
                    
                    // Record transaction results
                    if (result.transactions) {
                        transactions.push(...result.transactions);
                    }
                }
            }
            
            // Update adaptive mutation rate
            this.updateAdaptiveMutationRate(successfulMutations / results.length);
            
            iterationCount += results.length;
            this.metricsCollector.recordMetric('fuzzer.iteration', iterationCount);
        }

        // Record final metrics
        const executionTimeMs = Date.now() - startTime;
        this.metricsCollector.recordMetric('fuzzer.execution_time', executionTimeMs);
        this.metricsCollector.recordMetric('fuzzer.unique_inputs', uniqueInputsCount);

        return {
            input,
            vulnerabilities: Array.from(vulnerabilities),
            metrics: {
                totalExecutions: iterationCount,
                successfulExecutions: uniqueInputsCount,
                failedExecutions: iterationCount - uniqueInputsCount,
                totalTests: iterationCount,
                executionTime: executionTimeMs,
                errorRate: (iterationCount - uniqueInputsCount) / iterationCount,
                coverage: uniqueInputsCount / this.config.maxIterations,
                vulnerabilitiesFound: Array.from(vulnerabilities).map(v => v.vulnerabilityType),
                securityScore: 100 - (vulnerabilities.size * 10),
                riskLevel: this.calculateRiskLevel(vulnerabilities.size),
                averageExecutionTime: executionTimeMs / iterationCount,
                peakMemoryUsage: process.memoryUsage().heapUsed,
                cpuUtilization: process.cpuUsage().user / 1000000,
                uniquePaths: uniqueInputsCount,
                edgeCoverage: uniqueInputsCount / this.config.maxIterations,
                mutationEfficiency: totalSuccessfulMutations / iterationCount
            },
            transactions
        };
    }

    private calculateRiskLevel(vulnerabilityCount: number): SecurityLevel {
        if (vulnerabilityCount === 0) return SecurityLevel.LOW;
        if (vulnerabilityCount <= 2) return SecurityLevel.MEDIUM;
        if (vulnerabilityCount <= 5) return SecurityLevel.HIGH;
        return SecurityLevel.CRITICAL;
    }
}
