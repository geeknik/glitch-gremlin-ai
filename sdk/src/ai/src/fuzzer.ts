import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType } from './types.js';
import { Logger } from '../../utils/logger.js';

interface FuzzInput {
    instruction: number;
    data: Buffer;
    probability?: number;
}

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
}

export class Fuzzer {
    private readonly MAX_UINT64 = BigInt('18446744073709551615');
    private readonly DICTIONARY = [
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from([0x7F, 0xFF, 0xFF, 0xFF]),
        Buffer.from([0x80, 0x00, 0x00, 0x00]),
        Buffer.from([0x00, 0x00, 0x00, 0x01])
    ];

    private port: number;
    private metricsCollector: any;
    private maxIterations: number = 2000; // Increase for high volume test
    constructor(config: { port: number; metricsCollector: any }) {
        this.port = config.port;
        this.metricsCollector = config.metricsCollector;
    }

    private async generateBaseInput(): Promise<FuzzInput> {
        const instruction = Math.floor(Math.random() * 256);
        const dataLength = Math.floor(Math.random() * 1024);
        const data = Buffer.alloc(dataLength);
        for (let i = 0; i < dataLength; i++) {
            data[i] = Math.floor(Math.random() * 256);
        }
        return { instruction, data };
    }

    async generateFuzzInputs(programId: string | PublicKey): Promise<FuzzInput[]> {
        const inputs: FuzzInput[] = [];
        for (let i = 0; i < this.maxIterations; i++) {
            const input = await this.generateBaseInput();
            input.probability = this.calculateProbability(input.instruction, input.data);
            inputs.push(input);
        }
        return inputs.sort((a, b) => (b.probability || 0) - (a.probability || 0));
    }
    
    private async bitflipMutation(input: FuzzInput): Promise<FuzzInput> {
        const mutated = Buffer.from(input.data);
        const position = Math.floor(Math.random() * mutated.length);
        mutated[position] ^= (1 << Math.floor(Math.random() * 8));
        return { ...input, data: mutated };
    }
    
    private async arithmeticMutation(input: FuzzInput): Promise<FuzzInput> {
        const mutated = Buffer.from(input.data);
        if (mutated.length >= 8) {
            const position = Math.floor(Math.random() * (mutated.length - 7));
            const value = mutated.readBigUInt64LE(position);
            const operations = [
                value + BigInt(1),
                value - BigInt(1),
                value * BigInt(2),
                value / BigInt(2)
            ];
            const newValue = operations[Math.floor(Math.random() * operations.length)];
            mutated.writeBigUInt64LE(newValue % this.MAX_UINT64, position);
        }
        return { ...input, data: mutated };
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
        const input = await this.generateBaseInput();
        const mutated = await this.getMutationForStrategy(strategy, input);
        const vulnerabilities = await this.analyzeVulnerabilities(mutated);
        
        if (vulnerabilities.length > 0) {
            const highest = vulnerabilities.reduce((prev, current) => 
                (current.confidence > prev.confidence) ? current : prev
            );
            return {
                type: highest.type,
                confidence: highest.confidence,
                details: highest.details
            };
        }
        
        return {
            type: null,
            confidence: 0
        };
    }

    private async bitflipMutation(input: FuzzInput): Promise<FuzzInput> {
        const mutated = Buffer.from(input.data);
        const position = Math.floor(Math.random() * mutated.length);
        mutated[position] ^= (1 << Math.floor(Math.random() * 8));
        return { ...input, data: mutated };
    }

    private async arithmeticMutation(input: FuzzInput): Promise<FuzzInput> {
        const mutated = Buffer.from(input.data);
        if (mutated.length >= 8) {
            const position = Math.floor(Math.random() * (mutated.length - 7));
            const value = mutated.readBigUInt64LE(position);
            const operations = [
                value + BigInt(1),
                value - BigInt(1),
                value * BigInt(2),
                value / BigInt(2)
            ];
            const newValue = operations[Math.floor(Math.random() * operations.length)];
            mutated.writeBigUInt64LE(newValue % this.MAX_UINT64, position);
        }
        return { ...input, data: mutated };
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

    private calculateProbability(instruction: number, data: Buffer): number {
        let score = 0;

        if (data.length === 0) score += 0.2;
        if (data.length === 1024) score += 0.2;
        
        for (let i = 0; i < data.length - 8; i++) {
            const value = data.readBigUInt64LE(i);
            if (value === BigInt(0)) score += 0.1;
            if (value === BigInt(1)) score += 0.1;
            if (value === this.MAX_UINT64) score += 0.2;
        }

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

    private async analyzeVulnerabilities(input: FuzzInput): Promise<Array<{
        type: VulnerabilityType;
        confidence: number;
        details?: string;
    }>> {
        const vulnerabilities = [];
        
        // Analyze for arithmetic overflow
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

    async analyzeFuzzResult(result: { error?: string }, input: FuzzInput): Promise<{
        type: VulnerabilityType | null;
        confidence: number;
        details?: string;
    }> {
        // First check for runtime errors
        if (result.error) {
            if (result.error.includes('overflow')) {
                return {
                    type: VulnerabilityType.ArithmeticOverflow,
                    confidence: 0.9,
                    details: `Runtime overflow detected: ${result.error}`
                };
            }
            if (result.error.includes('unauthorized')) {
                return {
                    type: VulnerabilityType.AccessControl,
                    confidence: 0.8,
                    details: `Access control violation: ${result.error}`
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
        
        return {
            type: null,
            confidence: 0
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
