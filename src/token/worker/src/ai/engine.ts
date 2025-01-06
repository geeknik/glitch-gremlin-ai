import { TestType, ChaosParams } from '../../types';
import { ExploitScanner } from './exploit-scanner';
import { FuzzTester } from './fuzz-tester';
import { LoadTester } from './load-tester';
import { ConcurrencyTester } from './concurrency-tester';
import { Logger } from '../utils/logger';

export class GlitchAIEngine {
    private exploitScanner: ExploitScanner;
    private fuzzTester: FuzzTester;
    private loadTester: LoadTester;
    private concurrencyTester: ConcurrencyTester;
    private logger: Logger;

    constructor() {
        this.mlModel = new VulnerabilityDetectionModel();
        this.exploitScanner = new ExploitScanner();
        this.fuzzTester = new FuzzTester();
        this.loadTester = new LoadTester();
        this.concurrencyTester = new ConcurrencyTester();
        this.logger = new Logger();
    }

    async analyzeProgram(programId: string): Promise<{
        vulnerabilities: string[];
        riskScore: number;
        recommendations: string[];
    }> {
        // Initial program analysis
        const staticAnalysis = await this.exploitScanner.analyzeStatic(programId);
        const dynamicAnalysis = await this.fuzzTester.quickScan(programId);
        
        return {
            vulnerabilities: [...staticAnalysis.findings, ...dynamicAnalysis.findings],
            riskScore: this.calculateRiskScore(staticAnalysis, dynamicAnalysis),
            recommendations: this.generateRecommendations(staticAnalysis, dynamicAnalysis)
        };
    }

    async executeChaosTest(
        programId: string,
        testType: TestType,
        params: ChaosParams
    ): Promise<{
        success: boolean;
        findings: string[];
        metrics: {
            totalTransactions: number;
            errorRate: number;
            avgLatency: number;
        };
    }> {
        this.logger.info(`Starting ${testType} test for program ${programId}`);

        switch (testType) {
            case TestType.EXPLOIT:
                return this.exploitScanner.runFullScan(programId, params);
            case TestType.FUZZ:
                return this.fuzzTester.runExtendedTest(programId, params);
            case TestType.LOAD:
                return this.loadTester.runLoadTest(programId, params);
            case TestType.CONCURRENCY:
                return this.concurrencyTester.runConcurrencyTest(programId, params);
            default:
                throw new Error(`Unsupported test type: ${testType}`);
        }
    }

    private calculateRiskScore(staticAnalysis: any, dynamicAnalysis: any): number {
        // Weighted scoring based on findings severity
        const staticWeight = 0.4;
        const dynamicWeight = 0.6;
        
        return (
            staticAnalysis.riskScore * staticWeight +
            dynamicAnalysis.riskScore * dynamicWeight
        );
    }

    private generateRecommendations(staticAnalysis: any, dynamicAnalysis: any): string[] {
        const recommendations: string[] = [];
        
        // Analyze findings and generate specific recommendations
        if (staticAnalysis.findings.length > 0) {
            recommendations.push(
                ...staticAnalysis.findings.map(f => `Fix ${f.type}: ${f.recommendation}`)
            );
        }

        if (dynamicAnalysis.findings.length > 0) {
            recommendations.push(
                ...dynamicAnalysis.findings.map(f => `Address ${f.type}: ${f.mitigation}`)
            );
        }

        return recommendations;
    }
}
