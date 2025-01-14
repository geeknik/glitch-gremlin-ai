import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType } from './types';
import { Logger } from '../../utils/logger';
import { ValidationResult } from '../../utils/validation';
import { TensorShape } from '@tensorflow/tfjs-core';
import { createHash } from 'crypto';

export class ValidationError extends Error
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class ResourceExhaustionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResourceExhaustionError';
    }
}

export class FuzzerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FuzzerError'; 
    }
}
interface FuzzInput {
    instruction: number;
    data: Buffer;
    probability?: number;
    metadata?: Record<string, unknown>;
    created?: Date;
}

interface FuzzConfig {
    maxIterations?: number;
    timeoutMs?: number; 
    memoryLimitMb?: number;
    strategies?: Strategy[];
    cleanup?: boolean;
    validateShapes?: boolean;
    collectMetrics?: boolean;
    targetCoverage?: number;
    };

interface FuzzResult {
    type: VulnerabilityType | null;
    confidence: number;
    details?: string;
}

interface CampaignResult {
    coverage: number;
    uniqueCrashes: number;
    executionsPerSecond: number;
}

interface FuzzingCampaignConfig {
    programId: PublicKey;
    duration: number;
    maxIterations?: number;
    strategies?: string[];
}

interface AnomalyDetectionModel {
    predict(input: Buffer): Promise<number>;
    initialize(): Promise<void>;
    dispose(): Promise<void>;
    validateInput(input: Buffer): ValidationResult; 
    getInputShape(): TensorShape;
}
// Campaign state interface
interface CampaignState {
    id: string;
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'failed' | 'paused';
    currentIteration: number;
    totalIterations: number;
    crashes: Set<string>;
    coverage: {
        current: number;
        target: number;
    };
    resourceUsage: {
        peakMemory: number;
        averageMemory: number;
        memoryReadings: number[];
    };
    anomalies: Array<{
        type: string;
        timestamp: Date;
        details: string;
    }>;
}

export class Fuzzer {
    // Static class constants
    private static readonly MAX_UINT64 = BigInt('18446744073709551615');
    private static readonly SUPPORTED_STRATEGIES: ReadonlyArray<Strategy> = [
        'bitflip',
        'arithmetic', 
        'havoc',
        'dictionary',
        'genetic'
    ];

    private static readonly DEFAULT_CONFIG: Required<FuzzConfig> = {
        maxIterations: 2000,
        timeoutMs: 30000,
        memoryLimitMb: 1024,
        strategies: ['bitflip', 'arithmetic', 'havoc'],
        cleanup: true,
        validateShapes: true,
        collectMetrics: true,
        targetCoverage: 80
    };

    // Instance properties
    private readonly port: number;
    private readonly metricsCollector: any;
    private readonly logger: Logger;
    private readonly coverage: Set<string>;
    private readonly interestingInputs: Set<string>;
    private readonly cache: {
        inputs: Map<string, FuzzInput>;
        results: Map<string, FuzzResult>;
        crashes: Set<string>;
    };

    private maxIterations: number;
    private cleanupHandlers: Array<() => Promise<void>>;
    private metrics: FuzzMetrics;
    private resourceTracker: {
        activeOperations: number;
        memoryUsage: number;
        startTime: number;
    };
    private campaignState: CampaignState;
    private progressCallback?: (progress: CampaignProgress) => void;
    private campaignState: CampaignState;
    private readonly coverage: Set<string>;
    private readonly interestingInputs: Set<string>;

    constructor(config: { 
        port: number; 
        metricsCollector: any;
        maxIterations?: number;
        resourceLimits?: {
            memoryLimitMb?: number;
            maxConcurrentOps?: number;
        };
    }) {
        this.port = config.port;
        this.metricsCollector = config.metricsCollector;
        this.maxIterations = config.maxIterations ?? 2000;
        this.cleanupHandlers = [];
        this.logger = new Logger('Fuzzer');
        this.metrics = {
            executionTime: 0,
            memoryUsage: 0,
            successfulMutations: 0,
            failedMutations: 0,
            uniqueCrashes: 0,
            coverage: 0
        };
        this.coverage = new Set();
        this.interestingInputs = new Set();
        this.campaignState = {
            id: '',
            startTime: new Date(),
            status: 'running',
            currentIteration: 0,
            totalIterations: 0,
            crashes: new Set(),
            coverage: {
                current: 0,
                target: 80
            },
            resourceUsage: {
                peakMemory: 0,
                averageMemory: 0,
                memoryReadings: []
            },
            anomalies: []
        };
    }

    private validateInput(input: FuzzInput): ValidationResult {
        const errors: string[] = [];
        if (!input.data) {
            errors.push('Input data is required');
        }
        if (input.instruction < 0 || input.instruction > 255) {
            errors.push('Instruction must be between 0 and 255');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private async generateBaseInput(): Promise<FuzzInput> {
        const instructionTypes = [
            () => Math.floor(Math.random() * 256), // Random instruction
            () => 0xFF, // Max instruction  
            () => 0x00, // Min instruction
            () => 0xF0, // Privileged instruction range
        ];

        const dataGenerators = [
            () => Buffer.alloc(32), // Empty buffer
            () => Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), // Max values  
            () => Buffer.from([0x00, 0x00, 0x00, 0x00]), // Min values
            () => {
                const size = Math.floor(Math.random() * 1024) + 1;
                return Buffer.alloc(size).map(() => Math.floor(Math.random() * 256));
            }
        ];

        const instruction = instructionTypes[Math.floor(Math.random() * instructionTypes.length)]();
        const data = dataGenerators[Math.floor(Math.random() * dataGenerators.length)]();

        return {
            instruction,
            data
        };
    }

    private async withErrorHandling<T>(operation: string, action: () => Promise<T>): Promise<T> {
        try {
            return await action();
        } catch (error) {
            this.logger.error(`Error in ${operation}:`, error);
            await this.cleanup();
            throw new FuzzerError(`${operation} failed: ${error.message}`);
        }
    }

    private async trackResource<T>(operation: string, action: () => Promise<T>): Promise<T> {
        this.resourceTracker.activeOperations++;
        this.resourceTracker.startTime = Date.now();
        try {
            return await action();
        } finally {
            this.resourceTracker.activeOperations--;
            const duration = Date.now() - this.resourceTracker.startTime;
            if (duration > 5000) {
                this.logger.warn(`Long running operation detected: ${operation} took ${duration}ms`);
            }
        }
    }

    private validateBufferOperation(buffer: Buffer, position: number, size: number): boolean {
        if (!buffer || position < 0 || position + size > buffer.length) {
            return false;
        }
        return true;
    }

    private validateMutation(input: FuzzInput, strategy: string): void {
        if (!input || !input.data) {
            throw new ValidationError('Invalid input for mutation');
        }
        if (!this.SUPPORTED_STRATEGIES.includes(strategy)) {
            throw new ValidationError(`Unsupported mutation strategy: ${strategy}`);
        }
    }

    async cleanup(): Promise<void> {
        for (const handler of this.cleanupHandlers) {
            await handler();
        }
        this.cleanupHandlers = [];
    }

    async generateFuzzInputs(
        programId: string | PublicKey,
        config?: Partial<FuzzConfig>
    ): Promise<FuzzInput[]> {
        return await this.withErrorHandling('generateFuzzInputs', async () => {
            if (!programId) {
                throw new ValidationError('Program ID is required');
            }

            const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
            const inputs: FuzzInput[] = [];
            const startTime = Date.now();

            try {
                for (let i = 0; i < finalConfig.maxIterations; i++) {
                    this.checkResourceLimits();
                    
                    const input = await this.withRetry(async () => {
                        const baseInput = await this.generateBaseInput();
                        baseInput.probability = this.calculateProbability(
                            baseInput.instruction,
                            baseInput.data
                        );
                        return baseInput;
                    });

                    if (finalConfig.validateShapes) {
                        const validation = this.validateInput(input);
                        if (!validation.isValid) {
                            this.logger.warn(`Invalid input generated: ${validation.errors.join(', ')}`);
                            continue;
                        }
                    }

                    inputs.push(input);

                    if (finalConfig.collectMetrics) {
                        await this.metricsCollector?.collect({
                            input,
                            duration: Date.now() - startTime
                        });
                    }
                }

                this.metrics.executionTime = (Date.now() - startTime) / 1000;
                return inputs.sort((a, b) => (b.probability || 0) - (a.probability || 0));
            } finally {
                if (finalConfig.cleanup) {
                    await this.cleanup();
                }
            }
        });
    }
        async generateBaseInput(): Promise<FuzzInput> {
            return this.withErrorHandling('generateBaseInput', async () => {
                const instructionGenerators = [
                    () => Math.floor(Math.random() * 256),
                    () => 0xFF,
                    () => 0x00,
                    () => 0xF0,
                    () => {
                        // Generate based on previous crashes
                        if (this.cache.crashes.size > 0) {
                            const crashedInputs = Array.from(this.cache.crashes);
                            const selected = crashedInputs[Math.floor(Math.random() * crashedInputs.length)];
                            const input = this.cache.inputs.get(selected);
                            return input ? input.instruction : Math.floor(Math.random() * 256);
                        }
                        return Math.floor(Math.random() * 256);
                    }
                ];

                const dataGenerators = [
                    () => Buffer.alloc(32),
                    () => Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]),
                    () => Buffer.from([0x00, 0x00, 0x00, 0x00]),
                    () => {
                        const size = Math.floor(Math.random() * 1024) + 1;
                        return Buffer.alloc(size).map(() => Math.floor(Math.random() * 256));
                    }
                ];

                const instruction = instructionGenerators[Math.floor(Math.random() * instructionGenerators.length)]();
                const data = dataGenerators[Math.floor(Math.random() * dataGenerators.length)]();

                return {
                    instruction,
                    data,
                    created: new Date(),
                    metadata: {
                        generator: 'base',
                        iteration: this.metrics.successfulMutations + this.metrics.failedMutations
                    }
                };
            });
        }
            
            // Memory monitoring
            if (process.memoryUsage().heapUsed > finalConfig.memoryLimitMb * 1024 * 1024) {
                throw new ResourceExhaustionError('Memory limit exceeded');
            }
            
            for (let i = 0; i < finalConfig.maxIterations; i++) {
                // Timeout check
                if (Date.now() - startTime > finalConfig.timeoutMs) {
                    this.logger.warn('Timeout reached while generating inputs');
                    break;
                }
                
                const input = await this.generateBaseInput();
                
                // Input validation
                if (finalConfig.validateShapes) {
                    const validation = this.validateInput(input);
                    if (!validation.isValid) {
                        this.logger.warn(`Invalid input generated: ${validation.errors.join(', ')}`);
                        continue;
                    }
                }
                
                input.probability = this.calculateProbability(input.instruction, input.data);
                inputs.push(input);
                
                // Collect metrics if enabled
                if (finalConfig.collectMetrics) {
                    await this.metricsCollector?.collect();
                }
            }
            
            // Sort by probability and cleanup
            const result = inputs.sort((a, b) => (b.probability || 0) - (a.probability || 0));
            
            if (finalConfig.cleanup) {
                await this.cleanup();
            }
            
            return result;
        } catch (error) {
            this.logger.error('Error generating fuzz inputs:', error);
            await this.cleanup();
            throw error;
        }
    }

    
    private async bitflipMutation(input: FuzzInput): Promise<MutationResult> {
        return await this.withErrorHandling('bitflipMutation', async () => {
            if (!this.validateBufferOperation(input.data, 0, input.data.length)) {
                return { success: false, error: 'Invalid buffer for mutation' };
            }

            const mutated = Buffer.from(input.data);
            const numMutations = Math.floor(Math.random() * 3) + 1; // 1-3 bit flips
            
            for (let i = 0; i < numMutations; i++) {
                const position = Math.floor(Math.random() * mutated.length);
                const bit = Math.floor(Math.random() * 8);
                mutated[position] ^= (1 << bit);
            }

            return {
                success: true,
                mutated: { ...input, data: mutated }
            };
        });
    }
    
    private async arithmeticMutation(input: FuzzInput): Promise<MutationResult> {
        return await this.withErrorHandling('arithmeticMutation', async () => {
            if (!this.validateBufferOperation(input.data, 0, 8)) {
                return { success: false, error: 'Buffer too small for arithmetic mutation' };
            }
            
            const mutated = Buffer.from(input.data);
            const position = Math.floor(Math.random() * (mutated.length - 7));
            const value = mutated.readBigUInt64LE(position);
            
            const operations = [
                value + BigInt(1),
                value - BigInt(1),
                value * BigInt(2),
                value === BigInt(0) ? BigInt(1) : value / BigInt(2),
                ~value,
                value << BigInt(1),
                value >> BigInt(1)
            ];
            
            const newValue = operations[Math.floor(Math.random() * operations.length)];
            mutated.writeBigUInt64LE(newValue % this.MAX_UINT64, position);
            
            return {
                success: true,
                mutated: { ...input, data: mutated }
            };
        });
    }
    
    private async havocMutation(input: FuzzInput): Promise<FuzzInput> {
        const mutations = [
            () => this.bitflipMutation(input),
            () => this.arithmeticMutation(input),
            () => this.dictionaryMutation(input)
        ];
        const selectedMutation = mutations[Math.floor(Math.random() * mutations.length)];
        return selectedMutation();
    }
    
    private async dictionaryMutation(input: FuzzInput): Promise<FuzzInput> {
        const mutated = Buffer.from(input.data);
        if (mutated.length >= 4) {
            const position = Math.floor(Math.random() * (mutated.length - 3));
            const dictionary = this.DICTIONARY[Math.floor(Math.random() * this.DICTIONARY.length)];
            dictionary.copy(mutated, position);
        }
        return { ...input, data: mutated };
    }

    private getMutationForStrategy(strategy: string, input: FuzzInput): Promise<FuzzInput> {
        switch(strategy) {
            case 'bitflip': return this.bitflipMutation(input);
            case 'arithmetic': return this.arithmeticMutation(input);
            case 'havoc': return this.havocMutation(input);
            case 'dictionary': return this.dictionaryMutation(input);
            default: throw new Error(`Unknown strategy: ${strategy}`);
        }
    }

    async fuzzWithStrategy(strategy: string, programId: PublicKey): Promise<FuzzResult> {
        try {
            const input = await this.generateBaseInput();
            const mutated = await this.getMutationForStrategy(strategy, input);
            const vulnerabilities = await this.analyzeVulnerabilities(mutated);
            
            // Always maintain a minimum confidence for valid mutations
            const baseConfidence = 0.1;
            
            if (vulnerabilities.length > 0) {
                const highest = vulnerabilities.reduce((prev, current) => 
                    (current.confidence > prev.confidence) ? current : prev
                );
                return {
                    type: highest.type,
                    confidence: Math.max(highest.confidence, baseConfidence),
                    details: highest.details
                };
            }
            
            return {
                type: null,
                confidence: baseConfidence,
                details: 'Valid mutation executed without vulnerabilities'
            };
        } catch (error) {
            console.error('Error in fuzzWithStrategy:', error);
            return {
                type: VulnerabilityType.ResourceExhaustion,
                confidence: 0.7,
                details: `Execution error: ${error.message}`
            };
        }
    }


    private calculateProbability(instruction: number, data: Buffer): number {
        let score = 0;

        // Base probability for all inputs
        score += 0.1;
        
        // Check data size characteristics with improved high-volume handling
        if (data.length === 0) {
            score += 0.2;
        } else if (data.length > 1000) {
            // Adjust score based on data size ranges for better high-volume handling
            if (data.length > 10000) {
                score += 0.5; // Very high volume
            } else if (data.length > 5000) {
                score += 0.4; // High volume
            } else {
                score += 0.3; // Moderate volume
            }
        }
        
        if (data.length === 1024) score += 0.2;
        
        // Analyze data patterns
        for (let i = 0; i < data.length - 8; i++) {
            const value = data.readBigUInt64LE(i);
            if (value === BigInt(0)) score += 0.1;
            if (value === BigInt(1)) score += 0.1;
            if (value === this.MAX_UINT64) score += 0.2;
            if (value > (this.MAX_UINT64 / BigInt(2))) score += 0.15; // Check for large values
        }

        // Consider instruction characteristics
        if (instruction > 0xF0) score += 0.2; // Higher probability for privileged instructions
        
        return Math.min(score, 1);
    }

    async generateEdgeCases(): Promise<Array<{type: string, value: Buffer}>> {
        return [
            { type: 'boundary', value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]) },
            { type: 'overflow', value: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) },
            { type: 'underflow', value: Buffer.from([0x01]) },
            { type: 'maxInt', value: Buffer.from([0x7F, 0xFF, 0xFF, 0xFF]) }
        ];
    }

    private async generateOverflowInput(): Promise<FuzzInput> {
        return {
            instruction: Math.floor(Math.random() * 256),
            data: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
        };
    }

    private async generateAccessControlInput(): Promise<FuzzInput> {
        return {
            instruction: 0xFF, // Typically reserved/admin instructions
            data: Buffer.alloc(32) // Empty auth data
        };
    }

    async generateVulnerableInput(type: VulnerabilityType): Promise<FuzzInput> {
        const inputs = {
            [VulnerabilityType.ArithmeticOverflow]: this.generateOverflowInput(),
            [VulnerabilityType.AccessControl]: this.generateAccessControlInput()
        };
        return inputs[type] || this.generateBaseInput();
    }

    async startFuzzingCampaign(config: FuzzingCampaignConfig): Promise<CampaignResult> {
        return await this.withErrorHandling('startFuzzingCampaign', async () => {
            const startTime = Date.now();
            let executions = 0;
            let crashes = 0;

            try {
                const iterations = Math.min(
                    config.maxIterations ?? this.maxIterations,
                    Fuzzer.DEFAULT_CONFIG.maxIterations
                );

                for (let i = 0; i < iterations; i++) {
                    this.checkResourceLimits();
                    
                    await this.withResourceTracking('fuzzIteration', async () => {
                        executions++;
                        
                        const result = await this.fuzzWithStrategy(
                            config.strategies?.[0] ?? 'havoc',
                            config.programId
                        );

                        if (result.type !== null) {
                            crashes++;
                            await this.reportCrash(result);
                        }

                        if (i % 10 === 0) {
                            await this.reportProgress({
                                currentIteration: i,
                                totalIterations: iterations,
                                uniqueCrashes: crashes,
                                coverage: (executions / iterations) * 100,
                                elapsedTime: (Date.now() - startTime) / 1000
                            });
                        }
                    });
                }

                const duration = (Date.now() - startTime) / 1000;
                this.metrics.executionTime = duration;

                return {
                    coverage: (executions / iterations) * 100,
                    uniqueCrashes: crashes,
                    executionsPerSecond: executions / duration
                };
            } finally {
                await this.cleanup();
            }
        });
    }

    async generateEdgeCases(): Promise<Array<{type: string, value: Buffer}>> {
        const startTime = Date.now();
        let crashes = 0;
        let executions = 0;
        
        const iterations = Math.min(config.maxIterations || this.maxIterations, 1000);
        for (let i = 0; i < iterations; i++) {
            executions++;
            const result = await this.fuzzWithStrategy('havoc', config.programId);
            if (result.type !== null) {
                crashes++;
            }
        }
        
        const duration = (Date.now() - startTime) / 1000; // in seconds
        return {
            coverage: (executions / iterations) * 100,
            uniqueCrashes: crashes,
            executionsPerSecond: executions / duration
        };
    }

    async fuzzWithAnomalyDetection(programId: PublicKey, model: AnomalyDetectionModel): Promise<void> {
        await model.initialize();
        const inputs = await this.generateFuzzInputs(programId);
        
        for (const input of inputs) {
            const anomalyScore = await model.predict(input.data);
            if (anomalyScore > 0.8) {
                this.metricsCollector?.reportAnomaly({
                    programId: programId.toBase58(),
                    input,
                    anomalyScore
                });
            }
        }
    }

    private async analyzeVulnerabilities(input: MutationResult): Promise<Array<{
        type: VulnerabilityType;
        confidence: number;
        details?: string;
    }>> {
        return this.withErrorHandling('analyzeVulnerabilities', async () => {
            if (!input.success || !input.mutated) {
                return [];
            }

            const vulnerabilities: Array<{
                type: VulnerabilityType;
                confidence: number;
                details?: string;
            }> = [];

            // Check for resource exhaustion
            if (input.mutated.data.length > 1000) {
                vulnerabilities.push({
                    type: VulnerabilityType.ResourceExhaustion,
                    confidence: 0.8,
                    details: `Large input size detected: ${input.mutated.data.length} bytes`
                });
            }

            // Check for arithmetic overflow
            if (input.mutated.data.length >= 8) {
                for (let i = 0; i <= input.mutated.data.length - 8; i++) {
                    const value = input.mutated.data.readBigUInt64LE(i);
                    if (value === Fuzzer.MAX_UINT64) {
                        vulnerabilities.push({
                            type: VulnerabilityType.ArithmeticOverflow,
                            confidence: 0.9,
                            details: `Potential integer overflow at offset ${i}`
                        });
                    }
                }
            }

            // Check for access control issues
            if (input.mutated.instruction > 0xF0) {
                vulnerabilities.push({
                    type: VulnerabilityType.AccessControl,
                    confidence: 0.7,
                    details: `Privileged instruction detected: 0x${input.mutated.instruction.toString(16)}`
                });
            }

            return vulnerabilities;
        });
    }
        type: VulnerabilityType;
        confidence: number;
        details?: string;
    }>> {
        const vulnerabilities = [];
        
        // Check for resource exhaustion with high-volume inputs
        if (input.data.length > 1000) {
            vulnerabilities.push({
                type: VulnerabilityType.ResourceExhaustion,
                confidence: 0.8,
                details: 'High volume input detected - potential resource exhaustion'
            });
        }
        
        // Analyze for arithmetic overflow with improved confidence
        if (input.data.length >= 8) {
            const value = input.data.readBigUInt64LE(0);
            if (value === this.MAX_UINT64) {
                vulnerabilities.push({
                    type: VulnerabilityType.ArithmeticOverflow,
                    confidence: 0.9,
                    details: 'Potential arithmetic overflow detected'
                });
            }
        }
        
        // Check for access control issues
        if (input.instruction > 0xF0) {
            vulnerabilities.push({
                type: VulnerabilityType.AccessControl,
                confidence: 0.7,
                details: 'Potential access control bypass attempt'
            });
        }
        
        // Check for PDA safety issues
        if (input.data.length > 0 && input.data[0] === 0xFF) {
            vulnerabilities.push({
                type: VulnerabilityType.PDASafety,
                confidence: 0.8,
                details: 'Potential PDA safety violation'
            });
        }
        
        return vulnerabilities;
    }

    async analyzeFuzzResult(result: { error?: string }, input: FuzzInput): Promise<FuzzResult> {
        return this.withErrorHandling('analyzeFuzzResult', async () => {
            // Check for runtime errors
            if (result.error) {
                if (result.error.includes('overflow')) {
                    return {
                        type: VulnerabilityType.ArithmeticOverflow,
                        confidence: 0.95,
                        details: `Runtime overflow detected: ${result.error}`
                    };
                }
                if (result.error.includes('unauthorized')) {
                    return {
                        type: VulnerabilityType.AccessControl,
                        confidence: 0.9,
                        details: `Access control violation: ${result.error}`
                    };
                }
                if (result.error.includes('out of memory') || result.error.includes('timeout')) {
                    return {
                        type: VulnerabilityType.ResourceExhaustion,
                        confidence: 0.85,
                        details: `Resource exhaustion detected: ${result.error}`
                    };
                }
            }

            // Analyze input for potential vulnerabilities
            const mutationResult: MutationResult = {
                success: true,
                mutated: input
            };
            const vulnerabilities = await this.analyzeVulnerabilities(mutationResult);

            if (vulnerabilities.length > 0) {
                // Return the highest confidence vulnerability
                const highest = vulnerabilities.reduce((prev, current) =>
                    current.confidence > prev.confidence ? current : prev
                );

                await this.cacheResult(input, {
                    type: highest.type,
                    confidence: highest.confidence,
                    details: highest.details
                });

                return {
                    type: highest.type,
                    confidence: highest.confidence,
                    details: highest.details
                };
            }

            return {
                type: null,
                confidence: 0.1,
                details: 'No vulnerabilities detected'
            };
        });
    }
        type: VulnerabilityType | null;
        confidence: number;
        details?: string;
    }> {
        // First check for runtime errors with enhanced confidence
        if (result.error) {
            if (result.error.includes('overflow')) {
                return {
                    type: VulnerabilityType.ArithmeticOverflow,
                    confidence: 0.95,
                    details: `Runtime overflow detected: ${result.error}`
                };
            }
            if (result.error.includes('unauthorized')) {
                return {
                    type: VulnerabilityType.AccessControl,
                    confidence: 0.9,
                    details: `Access control violation: ${result.error}`
                };
            }
            if (result.error.includes('out of memory') || result.error.includes('timeout')) {
                return {
                    type: VulnerabilityType.ResourceExhaustion,
                    confidence: 0.85,
                    details: `Resource exhaustion detected: ${result.error}`
                };
            }
        }
        
        // If no runtime errors, analyze the input for potential vulnerabilities
        const vulnerabilities = await this.analyzeVulnerabilities(input);
        if (vulnerabilities.length > 0) {
            // Return the highest confidence vulnerability
            const highest = vulnerabilities.reduce((prev, current) => 
                (current.confidence > prev.confidence) ? current : prev
            );
            return highest;
        }
        
        // Return base confidence for valid mutations that didn't trigger vulnerabilities
        return {
            type: null,
            confidence: 0.1,
            details: 'Valid mutation executed without detected vulnerabilities'
        };
    }

    async generateMutations(input: Buffer): Promise<Buffer[]> {
        const mutations: Buffer[] = [];
        
        // Bit flips
        const bitflip = Buffer.from(input);
        bitflip[Math.floor(Math.random() * bitflip.length)] ^= (1 << Math.floor(Math.random() * 8));
        mutations.push(bitflip);
        
        // Arithmetic mutations
        if (input.length >= 8) {
            const arithmetic = Buffer.from(input);
            const position = Math.floor(Math.random() * (arithmetic.length - 7));
            const value = arithmetic.readBigUInt64LE(position);
            arithmetic.writeBigUInt64LE(value + BigInt(1), position);
            mutations.push(arithmetic);
        }
        
        // Dictionary mutations
        const dictionary = Buffer.from(input);
        if (dictionary.length >= 4) {
            const position = Math.floor(Math.random() * (dictionary.length - 3));
            this.DICTIONARY[Math.floor(Math.random() * this.DICTIONARY.length)]
                .copy(dictionary, position);
            mutations.push(dictionary);
        }
        
        return mutations;
    }
}
