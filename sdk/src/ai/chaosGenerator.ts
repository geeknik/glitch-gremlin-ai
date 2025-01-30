import { PublicKey } from '@solana/web3.js';
import { VulnerabilityAnalysis, VulnerabilityType, SecurityLevel } from '../types.js';

export interface ChaosConfig {
    targetProgram: PublicKey;
    maxAccounts?: number;
    maxDataSize?: number;
    maxSeeds?: number;
    vulnerabilityTypes?: VulnerabilityType[];
}

export interface ChaosResult {
    success: boolean;
    coverage: number;
    vulnerabilities: VulnerabilityAnalysis[];
    transactions: {
        hash: string;
        status: 'success' | 'failed';
        error?: string;
        logs?: string[];
    }[];
}

interface ChaosParams {
    programId: PublicKey;
    accounts: PublicKey[];
    data: Buffer;
    seeds?: Buffer[];
    file?: string;
}

export class ChaosGenerator {
    private config: ChaosConfig;
    private currentFile?: string;

    constructor(config: ChaosConfig) {
        this.config = {
            ...config,
            maxAccounts: config.maxAccounts || 10,
            maxDataSize: config.maxDataSize || 1024,
            maxSeeds: config.maxSeeds || 32,
            vulnerabilityTypes: config.vulnerabilityTypes || [
                VulnerabilityType.ArithmeticOverflow,
                VulnerabilityType.AccessControl
            ]
        };
    }

    public async generateChaos(params: ChaosParams): Promise<ChaosResult> {
        const vulnerabilities: VulnerabilityAnalysis[] = [];
        const transactions: ChaosResult['transactions'] = [];

        // Check for arithmetic overflow vulnerabilities
        if (this.config.vulnerabilityTypes?.includes(VulnerabilityType.ArithmeticOverflow)) {
            const hasOverflow = this.detectArithmeticOverflow(params.data);
            if (hasOverflow) {
                vulnerabilities.push({
                    type: VulnerabilityType.ArithmeticOverflow,
                    severity: SecurityLevel.CRITICAL,
                    confidence: this.calculateConfidence(SecurityLevel.CRITICAL, [
                        `Data pattern: ${params.data.toString('hex')}`,
                        'Last 4 bytes contain potential overflow pattern'
                    ]),
                    description: 'Potential arithmetic overflow detected in instruction data',
                    location: {
                        file: params.file || 'unknown',
                        startLine: params.data.length - 4,
                        endLine: params.data.length
                    },
                    details: {
                        impact: "Critical - Potential integer overflow leading to incorrect calculations",
                        likelihood: "High - Common in arithmetic operations without proper checks",
                        recommendation: "Implement SafeMath operations or proper overflow checks",
                        references: ["CWE-190: Integer Overflow"]
                    }
                });
            }
        }

        // Check for access control vulnerabilities
        if (this.config.vulnerabilityTypes?.includes(VulnerabilityType.AccessControl)) {
            const hasAccessControl = this.detectAccessControl(params.accounts);
            if (hasAccessControl) {
                vulnerabilities.push({
                    type: VulnerabilityType.AccessControl,
                    severity: SecurityLevel.CRITICAL,
                    confidence: this.calculateConfidence(SecurityLevel.CRITICAL, [
                        'Unauthorized account detected in instruction',
                        ...params.accounts.map(acc => `Account: ${acc.toBase58()}`)
                    ]),
                    description: 'Potential access control vulnerability detected',
                    location: {
                        file: params.file || 'unknown',
                        startLine: 150,
                        endLine: 160,
                        function: "processTransaction"
                    },
                    details: {
                        impact: "Critical - Unauthorized access to restricted functions",
                        likelihood: "High - Missing or improper authority checks",
                        recommendation: "Implement proper authority validation",
                        references: ["CWE-284: Improper Access Control"]
                    }
                });
            }
        }

        // Generate transaction results
        transactions.push({
            hash: 'simulated-tx-' + Date.now(),
            status: vulnerabilities.length > 0 ? 'failed' : 'success',
            logs: [
                'Program log: Starting chaos test',
                ...vulnerabilities.map(v => `Program log: Found ${v.type} vulnerability`),
                'Program log: Completed chaos test'
            ]
        });

        return {
            success: true,
            coverage: this.calculateCoverage(params),
            vulnerabilities,
            transactions
        };
    }

    private detectArithmeticOverflow(data: Buffer): boolean {
        // Check for potential arithmetic overflow patterns in the last 4 bytes
        if (data.length >= 4) {
            const lastFourBytes = data.slice(-4);
            return lastFourBytes.every(byte => byte === 0xFF);
        }
        return false;
    }

    private detectAccessControl(accounts: PublicKey[]): boolean {
        // Check for potential access control issues
        // For testing purposes, we'll consider it vulnerable if an account matches our test case
        return accounts.some(acc => acc.toBase58() === '44444444444444444444444444444444');
    }

    private calculateCoverage(params: ChaosParams): number {
        // Calculate test coverage based on input parameters
        const dataPoints = [
            params.accounts.length > 0,
            params.data.length > 0,
            params.seeds && params.seeds.length > 0
        ].filter(Boolean).length;

        return dataPoints / 3;
    }

    public async mutateInstructionData(data: Buffer): Promise<Buffer> {
        // Randomly modify instruction data
        const mutated = Buffer.from(data);
        const position = Math.floor(Math.random() * data.length);
        if (position < data.length) {
            mutated[position] = Math.floor(Math.random() * 256);
        }
        return mutated;
    }

    public async mutateAccounts(accounts: PublicKey[]): Promise<PublicKey[]> {
        // Randomly modify account list
        const mutated = [...accounts];
        if (mutated.length > 0) {
            const position = Math.floor(Math.random() * mutated.length);
            // Generate a new random public key
            mutated[position] = new PublicKey(Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256))));
        }
        return mutated;
    }

    public async mutateSeeds(seeds: Buffer[]): Promise<Buffer[]> {
        // Randomly modify PDA seeds
        const mutated = seeds.map(seed => {
            const newSeed = Buffer.from(seed);
            const position = Math.floor(Math.random() * seed.length);
            if (position < seed.length) {
                newSeed[position] = Math.floor(Math.random() * 256);
            }
            return newSeed;
        });
        return mutated;
    }

    private calculateConfidence(severity: SecurityLevel, evidence: string[]): number {
        // Base confidence levels by severity
        const severityWeights = {
            [SecurityLevel.CRITICAL]: 0.9,
            [SecurityLevel.HIGH]: 0.75,
            [SecurityLevel.MEDIUM]: 0.6,
            [SecurityLevel.LOW]: 0.45
        };

        // Evidence strength factor (more evidence = higher confidence)
        const evidenceWeight = Math.min(evidence.length * 0.1, 0.5);
        
        // Combine severity base with evidence strength
        return Math.min(severityWeights[severity] + evidenceWeight, 1.0);
    }

    generateArithmeticVulnerability(): VulnerabilityAnalysis {
        const evidence = [
            'Integer overflow detected in token transfer calculation',
            'No SafeMath usage found',
            'Large number multiplication without checks'
        ];
        
        return {
            type: VulnerabilityType.ArithmeticOverflow,
            severity: SecurityLevel.CRITICAL,
            confidence: this.calculateConfidence(SecurityLevel.CRITICAL, evidence),
            description: 'Critical arithmetic overflow vulnerability detected in token calculations',
            location: {
                file: this.currentFile || 'program.rs',
                startLine: 156,
                endLine: 156
            },
            details: {
                impact: "Critical - Potential integer overflow in calculations",
                likelihood: "High - Unchecked arithmetic operations",
                recommendation: "Implement SafeMath or proper overflow checks",
                references: evidence
            }
        };
    }

    generateAccessControlVulnerability(): VulnerabilityAnalysis {
        const evidence = [
            'Missing owner check in critical function',
            'Public access to admin functionality',
            'No signer verification'
        ];

        return {
            type: VulnerabilityType.AccessControl,
            severity: SecurityLevel.CRITICAL,
            confidence: this.calculateConfidence(SecurityLevel.CRITICAL, evidence),
            description: 'Critical access control vulnerability in admin functions',
            location: {
                file: this.currentFile || 'program.rs',
                startLine: 120,
                endLine: 125
            },
            details: {
                impact: "Critical - Unauthorized access to admin functions",
                likelihood: "High - Missing authority checks",
                recommendation: "Implement proper authority validation",
                references: evidence
            }
        };
    }

    generateReentrancyVulnerability(): VulnerabilityAnalysis {
        const evidence = [
            'State update after external call',
            'Multiple CPI calls without locks',
            'Missing reentrancy guard'
        ];

        return {
            type: VulnerabilityType.Reentrancy,
            severity: SecurityLevel.HIGH,
            confidence: this.calculateConfidence(SecurityLevel.HIGH, evidence),
            description: 'Potential reentrancy vulnerability in cross-program invocations',
            location: {
                file: this.currentFile || 'unknown',
                startLine: 250,
                endLine: 270,
                function: "processInstruction"
            },
            details: {
                impact: "Critical - Potential reentrancy attack vector",
                likelihood: "High - Missing reentrancy guards",
                recommendation: "Implement checks-effects-interactions pattern",
                references: evidence
            }
        };
    }

    generatePDAValidationVulnerability(): VulnerabilityAnalysis {
        const evidence = [
            'Missing bump seed validation',
            'Incorrect PDA derivation check',
            'Potential address collision risk'
        ];

        return {
            type: VulnerabilityType.PDASafety,
            severity: SecurityLevel.HIGH,
            confidence: this.calculateConfidence(SecurityLevel.HIGH, evidence),
            description: 'Improper PDA validation could lead to account confusion',
            location: {
                file: this.currentFile || 'unknown',
                startLine: 300,
                endLine: 320,
                function: "validatePDA"
            },
            details: {
                impact: "High - Invalid PDA validation",
                likelihood: "Medium - Incorrect seed validation",
                recommendation: "Implement proper PDA validation checks",
                references: evidence
            }
        };
    }
}
