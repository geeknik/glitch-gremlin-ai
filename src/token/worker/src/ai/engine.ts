import { Connection } from '@solana/web3.js';
import { ExploitScanner } from './exploit-scanner';
import { VulnerabilityDetectionModel } from './ml-model';
import { ChaosTestResult } from './types';

interface TestType {
  EXPLOIT: string;
  FUZZ: string;
  LOAD: string;
  CONCURRENCY: string;
}

interface ChaosParams {
  duration: number;
  intensity: number;
}

export class GlitchAIEngine {
    private exploitScanner: ExploitScanner;
    private fuzzTester: FuzzTester;
    private loadTester: LoadTester;
    private concurrencyTester: ConcurrencyTester;
    private logger: Logger;
    private mlModel: VulnerabilityDetectionModel;

    constructor(private connection: Connection) {
        this.mlModel = new VulnerabilityDetectionModel();
        this.exploitScanner = new ExploitScanner(connection, this.mlModel, {
            info: (msg: string) => console.log(msg),
            error: (msg: string) => console.error(msg)
        });
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

    private calculateRiskScore(staticAnalysis: StaticAnalysisResult, dynamicAnalysis: DynamicAnalysisResult): number {
        // Weighted scoring based on findings severity
        const staticWeight = 0.4;
        const dynamicWeight = 0.6;
        
        return (
            staticAnalysis.riskScore * staticWeight +
            dynamicAnalysis.riskScore * dynamicWeight
        );
    }

    private generateRecommendations(staticAnalysis: StaticAnalysisResult, dynamicAnalysis: DynamicAnalysisResult): string[] {
        const recommendations: string[] = [];
        
        // Analyze findings and generate specific recommendations
        for (const finding of staticAnalysis.findings) {
            const typedFinding = finding as unknown as Finding;
            if (typedFinding.recommendation) {
                recommendations.push(`Fix ${typedFinding.type}: ${typedFinding.recommendation}`);
            }
        }

        for (const finding of dynamicAnalysis.findings) {
            const typedFinding = finding as unknown as Finding;
            if (typedFinding.mitigation) {
                recommendations.push(`Address ${typedFinding.type}: ${typedFinding.mitigation}`);
            }
        }

        return recommendations;
    }
}
