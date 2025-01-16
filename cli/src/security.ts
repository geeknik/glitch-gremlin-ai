import { Connection, PublicKey } from '@solana/web3.js';
import { VulnerabilityDetectionModel, VulnerabilityType } from '@glitch-gremlin/sdk';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type LowercaseSeverity = Lowercase<Severity>;

interface Vulnerability {
    type: VulnerabilityType;
    severity: Severity;
    description: string;
    location?: string;
    confidence: number;
    recommendations?: string[];
}

export interface SecurityReport {
    programId: string;
    riskLevel: Severity;
    vulnerabilities: {
        type: VulnerabilityType;
        severity: Severity;
        description: string;
        location?: string;
        confidence: number;
        recommendations?: string[];
    }[];
    metadata: {
        timestamp: number;
        scanDuration: number;
        programSize: number;
        modelVersion: string;
    };
    summary: {
        totalIssues: number;
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        lowCount: number;
    };
}

export async function analyzeSecurity(programAddress: string): Promise<SecurityReport> {
    try {
        const connection = new Connection('https://api.mainnet-beta.solana.com');
        const programId = new PublicKey(programAddress);
        
        // Get program data
        const accountInfo = await connection.getAccountInfo(programId);
        if (!accountInfo) {
            throw new Error('Program not found');
        }

        // Initialize AI model
        const model = new VulnerabilityDetectionModel();
        await model.ensureInitialized();

        const startTime = Date.now();
        
        // Extract features from program data
        const programData = accountInfo.data;
        const features = extractProgramFeatures(programData);
        
        // Get model predictions
        const prediction = await model.predict(features);
        
        // Analyze results and build report
        const vulnerabilities = [];
        const counts: Record<LowercaseSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
        
        if (prediction.confidence > 0.7) {
            const vuln = {
                type: prediction.type,
                severity: prediction.confidence > 0.9 ? 'CRITICAL' : 'HIGH',
                description: getVulnerabilityDescription(prediction.type),
                confidence: prediction.confidence,
                recommendations: getSecurityRecommendations(prediction.type)
            };
            
            vulnerabilities.push(vuln);
            counts[vuln.severity.toLowerCase() as Lowercase<Severity>]++;
        }
        
        const riskLevel = determineOverallRisk(counts);
        
        return {
            programId: programAddress,
            riskLevel,
            vulnerabilities: vulnerabilities.map(v => ({
                ...v,
                type: v.type as VulnerabilityType,
                severity: v.severity as Severity
            })),
            metadata: {
                timestamp: Date.now(),
                scanDuration: Date.now() - startTime,
                programSize: programData.length,
                modelVersion: '1.0.0'
            },
            summary: {
                totalIssues: vulnerabilities.length,
                criticalCount: counts.critical,
                highCount: counts.high,
                mediumCount: counts.medium,
                lowCount: counts.low
            }
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Security analysis failed: ${message}`);
    }
}

function extractProgramFeatures(programData: Buffer): number[] {
    // Basic feature extraction - can be enhanced based on specific security patterns
    return [
        programData.length,
        programData.filter(b => b === 0).length,
        programData.filter(b => b === 255).length,
        // Add more sophisticated feature extraction here
    ];
}

function getVulnerabilityDescription(type: string): string {
    const descriptions: Record<string, string> = {
        'REENTRANCY': 'Program contains patterns that could allow reentrant calls, potentially leading to state manipulation',
        'ARITHMETIC_OVERFLOW': 'Potential arithmetic overflow detected in critical operations',
        'ACCESS_CONTROL': 'Possible insufficient access control mechanisms detected',
        // Add more vulnerability descriptions
    };
    return descriptions[type] || 'Unknown vulnerability type';
}

function getSecurityRecommendations(type: string): string[] {
    const recommendations: Record<string, string[]> = {
        'REENTRANCY': [
            'Implement checks-effects-interactions pattern',
            'Add reentrancy guards to sensitive functions',
            'Consider using a reentrancy mutex'
        ],
        'ARITHMETIC_OVERFLOW': [
            'Use checked math operations',
            'Implement explicit bounds checking',
            'Consider using SafeMath-like libraries'
        ],
        // Add more recommendations
    };
    return recommendations[type] || ['Conduct manual security review'];
}

function determineOverallRisk(counts: { critical: number, high: number, medium: number, low: number }): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (counts.critical > 0) return 'CRITICAL';
    if (counts.high > 0) return 'HIGH';
    if (counts.medium > 0) return 'MEDIUM';
    return 'LOW';
}
