import { PublicKey } from '@solana/web3.js';
import { VulnerabilityType } from '../types.js';

export class Fuzzer {
    private readonly MAX_UINT64 = BigInt('18446744073709551615');
    
    constructor(private readonly maxIterations: number = 1000) {}

    async generateFuzzInputs(_programId: string | PublicKey): Promise<Array<{
        instruction: number;
        data: Buffer;
        probability: number;
    }>> {
        const inputs = [];
        
        for (let i = 0; i < this.maxIterations; i++) {
            // Generate random instruction index
            const instruction = Math.floor(Math.random() * 256);
            
            // Generate random data with varying lengths
            const dataLength = Math.floor(Math.random() * 1024); // Max 1KB
            const data = Buffer.alloc(dataLength);
            for (let j = 0; j < dataLength; j++) {
                data[j] = Math.floor(Math.random() * 256);
            }

            // Calculate probability of this being a valuable test case
            const probability = this.calculateProbability(instruction, data);
            
            inputs.push({ instruction, data, probability });
        }

        // Sort by probability to prioritize likely valuable cases
        return inputs.sort((a, b) => b.probability - a.probability);
    }

    private calculateProbability(instruction: number, data: Buffer): number {
        let score = 0;

        // Check for common edge cases
        if (data.length === 0) score += 0.2;
        if (data.length === 1024) score += 0.2;
        
        // Check for interesting values in data
        for (let i = 0; i < data.length - 8; i++) {
            const value = data.readBigUInt64LE(i);
            if (value === BigInt(0)) score += 0.1;
            if (value === BigInt(1)) score += 0.1;
            if (value === this.MAX_UINT64) score += 0.2;
        }

        // Normalize score to 0-1 range
        return Math.min(score, 1);
    }

    async analyzeFuzzResult(
        result: { error?: string },
        input: { instruction: number; data: Buffer }
    ): Promise<{
        type: VulnerabilityType | null;
        confidence: number;
        details?: string;
    }> {
        // Analyze error patterns
        if (result.error) {
            if (result.error.includes('overflow')) {
                return {
                    type: VulnerabilityType.ArithmeticOverflow,
                    confidence: 0.8,
                    details: `Arithmetic overflow detected with input: ${input.data.toString('hex')}`
                };
            }
            
            if (result.error.includes('unauthorized')) {
                return {
                    type: VulnerabilityType.AccessControl,
                    confidence: 0.7,
                    details: `Potential access control issue with instruction ${input.instruction}`
                };
            }
        }

        // No vulnerability detected
        return {
            type: null,
            confidence: 0,
        };
    }
}
