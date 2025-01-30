import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { FuzzingMutation, FuzzingResult, FuzzingMetrics, VulnerabilityInfo } from '../../types.js';
import { SecurityLevel, VulnerabilityType } from '../../types.js';

export class ChaosTester {
    private connection: Connection;
    private programId: PublicKey;
    private metrics: FuzzingMetrics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalTests: 0,
        executionTime: 0,
        errorRate: 0,
        coverage: 0,
        vulnerabilitiesFound: [],
        securityScore: 100,
        riskLevel: SecurityLevel.LOW,
        averageExecutionTime: 0,
        peakMemoryUsage: 0,
        cpuUtilization: 0,
        uniquePaths: 0,
        edgeCoverage: 0,
        mutationEfficiency: 0
    };
    private vulnerabilities: VulnerabilityInfo[] = [];

    constructor(connection: Connection, programId: string) {
        this.connection = connection;
        this.programId = new PublicKey(programId);
    }

    async testScenario(mutation: FuzzingMutation): Promise<FuzzingResult> {
        const startTime = Date.now();
        
        try {
            // Create and send test transaction
            const result = await this.executeTestTransaction(mutation);
            
            // Analyze results for vulnerabilities
            this.analyzeExecutionLogs(result);

            // Update metrics
            this.updateMetrics({
                executionTime: Date.now() - startTime,
                success: true
            });

            return {
                success: this.vulnerabilities.length === 0,
                vulnerabilities: this.vulnerabilities,
                expectedVulnerabilities: [],
                metrics: this.metrics,
                error: undefined
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

    private analyzeExecutionLogs(result: any): void {
        for (const log of result.logs) {
            if (log.includes('overflow') || log.includes('underflow')) {
                this.addVulnerability(VulnerabilityType.ArithmeticOverflow, SecurityLevel.HIGH);
            }
            if (log.includes('unauthorized') || log.includes('permission denied')) {
                this.addVulnerability(VulnerabilityType.AccessControl, SecurityLevel.HIGH);
            }
            if (log.includes('reentrancy') || log.includes('recursive call')) {
                this.addVulnerability(VulnerabilityType.Reentrancy, SecurityLevel.CRITICAL);
            }
            if (log.includes('invalid PDA') || log.includes('seed mismatch')) {
                this.addVulnerability(VulnerabilityType.PDASafety, SecurityLevel.HIGH);
            }
            if (log.includes('invalid CPI') || log.includes('program not found')) {
                this.addVulnerability(VulnerabilityType.CPISafety, SecurityLevel.HIGH);
            }
            if (log.includes('signer required') || log.includes('missing signature')) {
                this.addVulnerability(VulnerabilityType.SignerAuthorization, SecurityLevel.HIGH);
            }
        }
    }

    private addVulnerability(type: VulnerabilityType, severity: SecurityLevel): void {
        const vulnerability: VulnerabilityInfo = {
            id: `VULN-${Date.now()}-${type}`,
            name: type,
            description: this.getVulnerabilityDescription(type),
            severity: severity,
            confidence: this.calculateConfidence(),
            createdAt: new Date(),
            updatedAt: new Date(),
            evidence: this.collectEvidence(),
            recommendation: this.getVulnerabilityRecommendation(type),
            vulnerabilityType: type,
            details: {
                expectedValue: undefined,
                actualValue: undefined,
                location: undefined,
                impact: this.getVulnerabilityImpact(type),
                likelihood: severity
            }
        };
        this.vulnerabilities.push(vulnerability);
    }

    private getVulnerabilityDescription(type: VulnerabilityType): string {
        switch (type) {
            case VulnerabilityType.ArithmeticOverflow:
                return 'Potential arithmetic overflow/underflow detected';
            case VulnerabilityType.AccessControl:
                return 'Access control vulnerability detected';
            case VulnerabilityType.Reentrancy:
                return 'Potential reentrancy vulnerability detected';
            case VulnerabilityType.PDASafety:
                return 'PDA validation vulnerability detected';
            case VulnerabilityType.CPISafety:
                return 'CPI safety vulnerability detected';
            case VulnerabilityType.SignerAuthorization:
                return 'Signer authorization vulnerability detected';
            case VulnerabilityType.AuthorityCheck:
                return 'Authority check vulnerability detected';
            case VulnerabilityType.DataValidation:
                return 'Data validation vulnerability detected';
            case VulnerabilityType.AccountValidation:
                return 'Account validation vulnerability detected';
            case VulnerabilityType.None:
                return 'No vulnerability detected';
            default:
                return 'Unknown vulnerability detected';
        }
    }

    private getVulnerabilityRecommendation(type: VulnerabilityType): string {
        switch (type) {
            case VulnerabilityType.ArithmeticOverflow:
                return 'Implement checked math operations and proper bounds checking';
            case VulnerabilityType.AccessControl:
                return 'Implement proper access control checks and authority validation';
            case VulnerabilityType.Reentrancy:
                return 'Implement reentrancy guards and follow checks-effects-interactions pattern';
            case VulnerabilityType.PDASafety:
                return 'Implement proper PDA validation and ownership checks';
            case VulnerabilityType.CPISafety:
                return 'Implement proper CPI target validation and security checks';
            case VulnerabilityType.SignerAuthorization:
                return 'Implement proper signer validation and authority checks';
            case VulnerabilityType.AuthorityCheck:
                return 'Implement proper authority validation checks';
            case VulnerabilityType.DataValidation:
                return 'Implement proper data validation checks';
            case VulnerabilityType.AccountValidation:
                return 'Implement proper account validation checks';
            case VulnerabilityType.None:
                return 'No security issues found - maintain secure coding practices';
            default:
                return 'Review and implement proper security controls';
        }
    }

    private getVulnerabilityImpact(type: VulnerabilityType): string {
        switch (type) {
            case VulnerabilityType.ArithmeticOverflow:
                return 'Potential fund loss or incorrect balance calculations';
            case VulnerabilityType.AccessControl:
                return 'Unauthorized access to protected functionality';
            case VulnerabilityType.Reentrancy:
                return 'Potential manipulation of program state and fund drainage';
            case VulnerabilityType.PDASafety:
                return 'Potential account confusion or unauthorized access';
            case VulnerabilityType.CPISafety:
                return 'Potential execution of malicious code or fund drainage';
            case VulnerabilityType.SignerAuthorization:
                return 'Unauthorized transaction execution';
            case VulnerabilityType.AuthorityCheck:
                return 'Unauthorized access to privileged operations';
            case VulnerabilityType.DataValidation:
                return 'Potential data corruption or invalid state';
            case VulnerabilityType.AccountValidation:
                return 'Potential account confusion or unauthorized access';
            case VulnerabilityType.None:
                return 'No security impact';
            default:
                return 'Unknown impact';
        }
    }

    private updateMetrics(data: { executionTime: number; success: boolean }): void {
        this.metrics.totalExecutions++;
        this.metrics.executionTime += data.executionTime;
        this.metrics.averageExecutionTime = this.metrics.executionTime / this.metrics.totalExecutions;
        
        if (data.success) {
            this.metrics.successfulExecutions++;
        } else {
            this.metrics.failedExecutions++;
        }
        
        this.metrics.errorRate = this.metrics.failedExecutions / this.metrics.totalExecutions;
        this.metrics.vulnerabilitiesFound = this.vulnerabilities.map(v => v.vulnerabilityType);
        
        // Update security score based on vulnerabilities found
        this.updateSecurityScore();
    }

    private updateSecurityScore(): void {
        const vulnerabilityWeights = this.getVulnerabilityWeights();

        let totalWeight = 0;
        for (const vuln of this.vulnerabilities) {
            totalWeight += vulnerabilityWeights[vuln.vulnerabilityType] || 0.5;
        }

        this.metrics.securityScore = Math.max(0, 100 - (totalWeight * 20));
        this.metrics.riskLevel = this.calculateRiskLevel(this.metrics.securityScore);
    }

    private calculateRiskLevel(score: number): SecurityLevel {
        if (score < 40) return SecurityLevel.CRITICAL;
        if (score < 60) return SecurityLevel.HIGH;
        if (score < 80) return SecurityLevel.MEDIUM;
        return SecurityLevel.LOW;
    }

    private async executeTestTransaction(mutation: FuzzingMutation): Promise<any> {
        const startTime = Date.now();
        
        try {
            const transaction = new Transaction();
            
            // Add test instruction based on mutation type
            const instruction = await this.createTestInstruction(mutation);
            transaction.add(instruction);

            // Send and confirm transaction
            const result = await this.connection.simulateTransaction(transaction);
            
            return result;
        } catch (error) {
            throw new Error(`Test transaction execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async createTestInstruction(mutation: FuzzingMutation): Promise<any> {
        // Create instruction based on mutation type
        return {
            programId: this.programId,
            keys: [],
            data: Buffer.from(JSON.stringify(mutation.payload))
        };
    }

    private calculateConfidence(): number {
        // Simple confidence calculation based on evidence and validation
        return 0.9; // High confidence for now, can be made more sophisticated
    }

    private collectEvidence(): string[] {
        // Collect evidence from test execution
        return [
            `Test executed at: ${new Date().toISOString()}`,
            `Program ID: ${this.programId}`,
            `Transaction count: ${this.metrics.totalExecutions}`
        ];
    }

    private getVulnerabilityWeights(): Record<VulnerabilityType, number> {
        const weights: Record<VulnerabilityType, number> = {
            [VulnerabilityType.Reentrancy]: 0.9,
            [VulnerabilityType.ArithmeticOverflow]: 0.8,
            [VulnerabilityType.AccessControl]: 0.85,
            [VulnerabilityType.PDASafety]: 0.7,
            [VulnerabilityType.CPISafety]: 0.75,
            [VulnerabilityType.SignerAuthorization]: 0.8,
            [VulnerabilityType.AuthorityCheck]: 0.7,
            [VulnerabilityType.DataValidation]: 0.6,
            [VulnerabilityType.AccountValidation]: 0.65,
            [VulnerabilityType.None]: 0.0
        };
        return weights;
    }
} 