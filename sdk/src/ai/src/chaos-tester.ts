import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { FuzzingMutation, FuzzingResult, FuzzingMetrics, VulnerabilityInfo } from '../../types.js';
import { VulnerabilityType } from '../../types.js';

export class ChaosTester {
    private connection: Connection;
    private programId: PublicKey;
    private metrics: FuzzingMetrics;
    private vulnerabilities: VulnerabilityInfo[] = [];

    constructor(connection: Connection, programId: string) {
        this.connection = connection;
        this.programId = new PublicKey(programId);
        this.metrics = this.initializeMetrics();
    }

    private initializeMetrics(): FuzzingMetrics {
        return {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalTests: 0,
            executionTime: 0,
            errorRate: 0,
            coverage: 0,
            vulnerabilitiesFound: [],
            securityScore: 0,
            riskLevel: 'LOW',
            averageExecutionTime: 0,
            peakMemoryUsage: 0,
            cpuUtilization: 0,
            uniquePaths: 0,
            edgeCoverage: 0,
            mutationEfficiency: 0
        };
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
                this.addVulnerability(VulnerabilityType.ArithmeticOverflow, 'HIGH');
            }
            if (log.includes('unauthorized') || log.includes('permission denied')) {
                this.addVulnerability(VulnerabilityType.AccessControl, 'HIGH');
            }
            if (log.includes('reentrancy') || log.includes('recursive call')) {
                this.addVulnerability(VulnerabilityType.Reentrancy, 'CRITICAL');
            }
            if (log.includes('invalid PDA') || log.includes('seed mismatch')) {
                this.addVulnerability(VulnerabilityType.PDAValidation, 'HIGH');
            }
            if (log.includes('invalid CPI') || log.includes('program not found')) {
                this.addVulnerability(VulnerabilityType.CPISafety, 'HIGH');
            }
            if (log.includes('signer required') || log.includes('missing signature')) {
                this.addVulnerability(VulnerabilityType.SignerAuthorization, 'HIGH');
            }
        }
    }

    private addVulnerability(type: VulnerabilityType, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): void {
        const vulnerability: VulnerabilityInfo = {
            id: `VULN-${Date.now()}-${type}`,
            name: type,
            description: this.getVulnerabilityDescription(type),
            severity: severity.toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
            confidence: 0.9,
            createdAt: new Date(),
            updatedAt: new Date(),
            evidence: [],
            recommendation: this.getVulnerabilityRecommendation(type),
            vulnerabilityType: type,
            details: {
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
            case VulnerabilityType.PDAValidation:
                return 'PDA validation vulnerability detected';
            case VulnerabilityType.CPISafety:
                return 'CPI safety vulnerability detected';
            case VulnerabilityType.SignerAuthorization:
                return 'Signer authorization vulnerability detected';
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
            case VulnerabilityType.PDAValidation:
                return 'Implement proper PDA validation and ownership checks';
            case VulnerabilityType.CPISafety:
                return 'Implement proper CPI target validation and security checks';
            case VulnerabilityType.SignerAuthorization:
                return 'Implement proper signer validation and authority checks';
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
            case VulnerabilityType.PDAValidation:
                return 'Potential account confusion or unauthorized access';
            case VulnerabilityType.CPISafety:
                return 'Potential execution of malicious code or fund drainage';
            case VulnerabilityType.SignerAuthorization:
                return 'Unauthorized transaction execution';
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
        const vulnerabilityWeights: Record<VulnerabilityType, number> = {
            [VulnerabilityType.None]: 0.0,
            [VulnerabilityType.Reentrancy]: 1.0,
            [VulnerabilityType.ArithmeticOverflow]: 0.8,
            [VulnerabilityType.AccessControl]: 0.9,
            [VulnerabilityType.PDASafety]: 0.7,
            [VulnerabilityType.CPISafety]: 0.8,
            [VulnerabilityType.SignerAuthorization]: 0.9,
            [VulnerabilityType.AuthorityCheck]: 0.9,
            [VulnerabilityType.DataValidation]: 0.6,
            [VulnerabilityType.AccountValidation]: 0.7,
            [VulnerabilityType.CPIValidation]: 0.8,
            [VulnerabilityType.AuthorityValidation]: 0.9,
            [VulnerabilityType.SignerValidation]: 0.9,
            [VulnerabilityType.PDAValidation]: 0.7,
            [VulnerabilityType.AccountConfusion]: 0.8,
            [VulnerabilityType.ClockManipulation]: 0.7,
            [VulnerabilityType.StateConsistency]: 0.7,
            [VulnerabilityType.LamportDrain]: 0.9,
            [VulnerabilityType.InstructionInjection]: 0.9,
            [VulnerabilityType.RaceCondition]: 0.8,
            [VulnerabilityType.ComputeBudget]: 0.6,
            [VulnerabilityType.TokenValidation]: 0.8,
            [VulnerabilityType.TimelockBypass]: 0.8,
            [VulnerabilityType.QuorumManipulation]: 0.9,
            [VulnerabilityType.DelegateAbuse]: 0.8,
            [VulnerabilityType.TreasuryDrain]: 1.0,
            [VulnerabilityType.Custom]: 0.5
        };

        let totalWeight = 0;
        for (const vuln of this.vulnerabilities) {
            totalWeight += vulnerabilityWeights[vuln.vulnerabilityType] || 0.5;
        }

        this.metrics.securityScore = Math.max(0, 100 - (totalWeight * 20));
        this.metrics.riskLevel = this.calculateRiskLevel(this.metrics.securityScore);
    }

    private calculateRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        if (score >= 90) return 'LOW';
        if (score >= 70) return 'MEDIUM';
        if (score >= 50) return 'HIGH';
        return 'CRITICAL';
    }

    private async executeTestTransaction(mutation: FuzzingMutation): Promise<any> {
        const transaction = new Transaction();
        
        // Add test instruction based on mutation type
        const instruction = await this.createTestInstruction(mutation);
        transaction.add(instruction);

        // Send and confirm transaction
        const result = await this.connection.simulateTransaction(transaction);
        
        return result;
    }

    private async createTestInstruction(mutation: FuzzingMutation): Promise<any> {
        // Create instruction based on mutation type
        return {
            programId: this.programId,
            keys: [],
            data: Buffer.from(JSON.stringify(mutation.payload))
        };
    }
} 