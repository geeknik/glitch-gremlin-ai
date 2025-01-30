import { VulnerabilityType, FuzzingMutation, MutationType, SecurityLevel } from '../../types.js';
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
            securityImpact: 'HIGH' as SecurityLevel,
            description: 'Testing for arithmetic overflow/underflow vulnerabilities',
            expectedVulnerability: VulnerabilityType.ArithmeticOverflow
        };
    }

    public generateAccessControlMutation(): FuzzingMutation {
        const unauthorizedKey = new PublicKey(generateRandomBytes(32));
        return {
            type: MutationType.AccessControl,
            target: 'authority_check',
            payload: unauthorizedKey.toBase58(),
            securityImpact: 'HIGH' as SecurityLevel,
            description: 'Testing for access control vulnerabilities',
            expectedVulnerability: VulnerabilityType.AccessControl
        };
    }

    public generateReentrancyMutation(): FuzzingMutation {
        return {
            type: MutationType.Reentrancy,
            target: 'cross_program_invocation',
            payload: JSON.stringify({
                instructions: [
                    { index: 0, repeat: 2 }
                ]
            }),
            securityImpact: 'CRITICAL' as SecurityLevel,
            description: 'Testing for reentrancy vulnerabilities',
            expectedVulnerability: VulnerabilityType.Reentrancy
        };
    }

    public generatePDAMutation(): FuzzingMutation {
        const programId = new PublicKey(generateRandomBytes(32));
        return {
            type: MutationType.PDA,
            target: 'pda_validation',
            payload: JSON.stringify({
                seeds: generateRandomBytes(32),
                programId: programId.toBase58()
            }),
            securityImpact: 'HIGH' as SecurityLevel,
            description: 'Testing for PDA validation vulnerabilities',
            expectedVulnerability: VulnerabilityType.PdaSafety
        };
    }

    public generateConcurrencyMutation(): FuzzingMutation {
        return {
            type: MutationType.Concurrency,
            target: 'concurrent_operation',
            payload: Buffer.from(JSON.stringify({
                threadCount: 5,
                operations: ['read', 'write', 'modify']
            })),
            securityImpact: 'HIGH' as SecurityLevel,
            description: 'Testing for concurrency vulnerabilities',
            expectedVulnerability: VulnerabilityType.StateConsistency
        };
    }

    public generateDataValidationMutation(): FuzzingMutation {
        return {
            type: MutationType.DataValidation,
            target: 'input_validation',
            payload: Buffer.from(JSON.stringify({
                invalidData: generateRandomBytes(16).toString('hex'),
                expectedFormat: 'hex'
            })),
            securityImpact: 'MEDIUM' as SecurityLevel,
            description: 'Testing for data validation vulnerabilities',
            expectedVulnerability: VulnerabilityType.DataValidation
        };
    }

    public generateCustomMutation(): FuzzingMutation {
        return {
            type: MutationType.Custom,
            target: 'custom_operation',
            payload: Buffer.from(JSON.stringify({
                customData: generateRandomBytes(32).toString('hex'),
                operation: 'custom_test'
            })),
            securityImpact: 'MEDIUM' as SecurityLevel,
            description: 'Testing with custom mutation pattern',
            expectedVulnerability: VulnerabilityType.Custom
        };
    }
} 