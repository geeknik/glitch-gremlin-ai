import { VulnerabilityType, FuzzingMutation, MutationType } from '../../types.js';
import { PublicKey } from '@solana/web3.js';
import { generateRandomBytes, generateRandomU64 } from '../utils/random.js';

interface FuzzingConfig {
    mutationRate: number;
    maxIterations: number;
    timeoutMs: number;
    securityLevel: number;
}

export interface IFuzzingStrategy {
    generateMutation(type: MutationType): FuzzingMutation;
    generateArithmeticMutation(): FuzzingMutation;
    generateAccessControlMutation(): FuzzingMutation;
    generateReentrancyMutation(): FuzzingMutation;
    generatePDAMutation(): FuzzingMutation;
    generateConcurrencyMutation(): FuzzingMutation;
    generateDataValidationMutation(): FuzzingMutation;
    generateCustomMutation(): FuzzingMutation;
}

export class SolanaFuzzingStrategy implements IFuzzingStrategy {
    private config: FuzzingConfig;
    private mutationRate: number;
    private securityLevel: number;

    constructor(config: FuzzingConfig) {
        this.config = config;
        this.mutationRate = config.mutationRate;
        this.securityLevel = config.securityLevel;
    }

    public generateMutation(type: MutationType): FuzzingMutation {
        switch (type) {
            case MutationType.Arithmetic:
                return this.generateArithmeticMutation();
            case MutationType.AccessControl:
                return this.generateAccessControlMutation();
            case MutationType.Reentrancy:
                return this.generateReentrancyMutation();
            case MutationType.PDA:
                return this.generatePDAMutation();
            case MutationType.Concurrency:
                return this.generateConcurrencyMutation();
            case MutationType.DataValidation:
                return this.generateDataValidationMutation();
            case MutationType.Custom:
                return this.generateCustomMutation();
            default:
                throw new Error(`Unsupported mutation type: ${type}`);
        }
    }

    public generateArithmeticMutation(): FuzzingMutation {
        return {
            type: MutationType.Arithmetic,
            target: 'arithmetic_operation',
            payload: generateRandomU64().toString(),
            securityImpact: 'HIGH',
            description: 'Testing for arithmetic overflow/underflow vulnerabilities'
        };
    }

    public generateAccessControlMutation(): FuzzingMutation {
        const unauthorizedKey = new PublicKey(generateRandomBytes(32));
        return {
            type: MutationType.AccessControl,
            target: 'authority_check',
            payload: unauthorizedKey.toBase58(),
            securityImpact: 'HIGH',
            description: 'Testing for access control vulnerabilities'
        };
    }

    public generateReentrancyMutation(): FuzzingMutation {
        return {
            type: MutationType.Reentrancy,
            target: 'cross_program_invocation',
            payload: {
                instructions: [
                    { index: 0, repeat: 2 }
                ]
            },
            securityImpact: 'CRITICAL',
            description: 'Testing for reentrancy vulnerabilities'
        };
    }

    public generatePDAMutation(): FuzzingMutation {
        return {
            type: MutationType.PDA,
            target: 'pda_validation',
            payload: generateRandomBytes(32).toString('hex'),
            securityImpact: 'HIGH',
            description: 'Testing for PDA validation vulnerabilities'
        };
    }

    public generateConcurrencyMutation(): FuzzingMutation {
        return {
            type: MutationType.Concurrency,
            target: 'concurrent_operation',
            payload: {
                threadCount: 5,
                operations: ['read', 'write', 'modify']
            },
            securityImpact: 'HIGH',
            description: 'Testing for concurrency vulnerabilities'
        };
    }

    public generateDataValidationMutation(): FuzzingMutation {
        return {
            type: MutationType.DataValidation,
            target: 'input_validation',
            payload: {
                invalidData: generateRandomBytes(16).toString('hex'),
                expectedFormat: 'hex'
            },
            securityImpact: 'MEDIUM',
            description: 'Testing for data validation vulnerabilities'
        };
    }

    public generateCustomMutation(): FuzzingMutation {
        return {
            type: MutationType.Custom,
            target: 'custom_operation',
            payload: {
                customData: generateRandomBytes(32).toString('hex'),
                operation: 'custom_test'
            },
            securityImpact: 'MEDIUM',
            description: 'Testing with custom mutation pattern'
        };
    }
} 