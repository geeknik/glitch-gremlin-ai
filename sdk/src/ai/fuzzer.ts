import { VulnerabilityType, FuzzingResult, FuzzingMetrics, VulnerabilityInfo, SecurityLevel } from '../types.js';
import { VulnerabilityAnalysis } from './types.js';
import { ChaosGenerator, ChaosConfig, ChaosResult } from './src/chaosGenerator.js';
import { MetricsCollector } from '../metrics/collector.js';
import { Logger } from '../utils/logger.js';

interface FuzzInput {
    programId: string;
    accounts: string[];
    data: Buffer;
    seeds?: Buffer[];
}

interface FuzzMetrics {
    successRate: number;
    executionTime: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    uniquePaths: number;
    coverage: number;
    errorRate: number;
}

interface FuzzResult {
    success: boolean;
    metrics: FuzzMetrics;
    vulnerabilities: VulnerabilityAnalysis[];
    error?: Error;
}

export class Fuzzer {
    private chaosGenerator: ChaosGenerator;
    private metrics: MetricsCollector;
    private config: ChaosConfig;
    private logger: Logger;

    constructor(config: ChaosConfig) {
        this.config = config;
        this.chaosGenerator = new ChaosGenerator(config);
        this.metrics = new MetricsCollector();
        this.logger = new Logger('Fuzzer');
    }

    public async fuzz(): Promise<FuzzingResult> {
        const result = await this.runFuzzingSession();
        return {
            success: result.metrics.successRate === 1,
            vulnerabilities: result.vulnerabilities.map(v => ({
                id: `VULN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: v.type.toString(),
                description: v.description,
                severity: v.severity,
                confidence: v.confidence,
                createdAt: new Date(),
                updatedAt: new Date(),
                evidence: v.evidence || [],
                recommendation: this.getRecommendation(v.type),
                vulnerabilityType: v.type,
                details: {
                    expectedValue: undefined,
                    actualValue: undefined,
                    location: v.location?.file,
                    impact: v.details?.impact,
                    likelihood: v.details?.likelihood
                }
            })),
            expectedVulnerabilities: [],
            metrics: {
                totalExecutions: result.metrics.totalExecutions,
                successfulExecutions: result.metrics.successfulExecutions,
                failedExecutions: result.metrics.failedExecutions,
                totalTests: result.metrics.totalExecutions,
                executionTime: result.metrics.executionTime,
                errorRate: result.metrics.errorRate,
                coverage: result.metrics.coverage,
                vulnerabilitiesFound: result.vulnerabilities.map(v => v.type),
                securityScore: this.calculateSecurityScore(result),
                riskLevel: this.calculateRiskLevel(result),
                averageExecutionTime: result.metrics.executionTime / result.metrics.totalExecutions,
                peakMemoryUsage: 0, // To be implemented
                cpuUtilization: 0, // To be implemented
                uniquePaths: result.metrics.uniquePaths,
                edgeCoverage: result.metrics.coverage,
                mutationEfficiency: result.metrics.successRate
            },
            error: result.error
        };
    }

    private async runFuzzingSession(): Promise<FuzzResult> {
        this.logger.info('Starting fuzzing session');
        const startTime = Date.now();
        
        const input: FuzzInput = {
            programId: this.config.programId,
            accounts: [],
            data: Buffer.from([]),
            seeds: [Buffer.from([])]
        };

        try {
            const result = await this.chaosGenerator.generateChaos(input);
            const success = result.status === 'success';
            
            return {
                success,
                metrics: {
                    successRate: success ? 1 : 0,
                    executionTime: result.metrics.executionTime,
                    totalExecutions: 1,
                    successfulExecutions: success ? 1 : 0,
                    failedExecutions: success ? 0 : 1,
                    uniquePaths: result.metrics.uniquePaths,
                    coverage: result.metrics.coverage,
                    errorRate: success ? 0 : 1
                },
                vulnerabilities: this.mapVulnerabilities(result.findings || []),
                error: result.error ? new Error(result.error) : undefined
            };
        } catch (error) {
            return {
                success: false,
                metrics: {
                    successRate: 0,
                    executionTime: 0,
                    totalExecutions: 1,
                    successfulExecutions: 0,
                    failedExecutions: 1,
                    uniquePaths: 0,
                    coverage: 0,
                    errorRate: 1
                },
                vulnerabilities: [],
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    private mapVulnerabilities(findings: ChaosResult['findings']): VulnerabilityAnalysis[] {
        return findings.map(finding => ({
            type: this.mapFindingToVulnerabilityType(finding.type),
            confidence: finding.confidence || 0.5,
            severity: finding.severity,
            description: finding.description,
            evidence: finding.evidence,
            metadata: finding.metadata,
            location: finding.location,
            details: {
                impact: finding.impact || 'Unknown',
                likelihood: finding.likelihood || 'Unknown',
                exploitScenario: finding.exploitScenario,
                recommendation: finding.recommendation || this.getRecommendation(this.mapFindingToVulnerabilityType(finding.type)),
                references: finding.references
            }
        }));
    }

    private mapFindingToVulnerabilityType(findingType: string): VulnerabilityType {
        switch (findingType.toUpperCase()) {
            case 'REENTRANCY': return VulnerabilityType.Reentrancy;
            case 'ARITHMETIC_OVERFLOW': return VulnerabilityType.ArithmeticOverflow;
            case 'ACCESS_CONTROL': return VulnerabilityType.AccessControl;
            case 'PDA_SAFETY': return VulnerabilityType.PdaSafety;
            case 'CPI_SAFETY': return VulnerabilityType.CpiSafety;
            default: return VulnerabilityType.None;
        }
    }

    private mapSeverityLevel(severity: string): SecurityLevel {
        switch (severity.toUpperCase()) {
            case 'CRITICAL': return 'CRITICAL';
            case 'HIGH': return 'HIGH';
            case 'MEDIUM': return 'MEDIUM';
            default: return 'LOW';
        }
    }

    private getRecommendation(type: VulnerabilityType): string {
        switch (type) {
            case VulnerabilityType.Reentrancy:
                return 'Implement checks-effects-interactions pattern and use reentrancy guards';
            case VulnerabilityType.ArithmeticOverflow:
                return 'Use checked math operations and implement value range validation';
            case VulnerabilityType.AccessControl:
                return 'Implement proper authorization checks and role-based access control';
            case VulnerabilityType.PdaSafety:
                return 'Validate PDA derivation and verify ownership';
            case VulnerabilityType.CpiSafety:
                return 'Validate CPI target programs and verify account permissions';
            default:
                return 'Review code for potential security issues and consider a security audit';
        }
    }

    private calculateSecurityScore(result: FuzzResult): number {
        const baseScore = 100;
        const vulnerabilityPenalty = result.vulnerabilities.length * 10;
        const coveragePenalty = (1 - result.metrics.coverage) * 20;
        return Math.max(0, baseScore - vulnerabilityPenalty - coveragePenalty);
    }

    private calculateRiskLevel(result: FuzzResult): SecurityLevel {
        const score = this.calculateSecurityScore(result);
        if (score >= 90) return 'LOW';
        if (score >= 70) return 'MEDIUM';
        if (score >= 50) return 'HIGH';
        return 'CRITICAL';
    }
}
