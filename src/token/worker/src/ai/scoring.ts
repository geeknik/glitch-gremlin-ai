import { VulnerabilityType, RiskLevel } from '../types.js';

export class ScoringSystem {
    private static readonly BASE_WEIGHTS = {
        reentrancy: 8.5,
        'arithmetic-overflow': 7.5,
        'access-control': 9.0,
        'race-condition': 7.0,
        'instruction-injection': 8.0,
        'account-confusion': 8.5,
        'signer-authorization': 9.0,
        'pda-validation': 8.0,
        'clock-manipulation': 6.5,
        'lamport-drain': 7.5
    };

    private static readonly SEVERITY_MULTIPLIERS = {
        [RiskLevel.Critical]: 1.0,
        [RiskLevel.High]: 0.8,
        [RiskLevel.Medium]: 0.6,
        [RiskLevel.Low]: 0.4,
        [RiskLevel.Info]: 0.2
    };

    public static calculateRiskScore(findings: Array<{
        type: VulnerabilityType;
        severity: RiskLevel;
        confidence: number;
    }>): number {
        let totalScore = 0;
        let maxPossibleScore = 0;

        for (const finding of findings) {
            const baseWeight = this.BASE_WEIGHTS[finding.type as keyof typeof this.BASE_WEIGHTS] || 5.0;
            const severityMultiplier = this.SEVERITY_MULTIPLIERS[finding.severity];
            const confidenceAdjustment = finding.confidence;

            const findingScore = baseWeight * severityMultiplier * confidenceAdjustment;
            totalScore += findingScore;
            maxPossibleScore += baseWeight;
        }

        // Normalize to 0-100 scale
        return Math.min(100, (totalScore / maxPossibleScore) * 100);
    }

    public static getRiskLevel(score: number): RiskLevel {
        if (score >= 80) return RiskLevel.Critical;
        if (score >= 60) return RiskLevel.High;
        if (score >= 40) return RiskLevel.Medium;
        if (score >= 20) return RiskLevel.Low;
        return RiskLevel.Info;
    }

    public static getRecommendations(findings: Array<{
        type: VulnerabilityType;
        severity: RiskLevel;
    }>): string[] {
        const recommendations: string[] = [];
        
        for (const finding of findings) {
            switch (finding.type) {
                case 'reentrancy':
                    recommendations.push('Implement checks-effects-interactions pattern');
                    break;
                case 'arithmetic-overflow':
                    recommendations.push('Use checked math operations');
                    break;
                case 'access-control':
                    recommendations.push('Implement proper authority validation');
                    break;
                // Add more specific recommendations for each type
            }
        }

        return recommendations;
    }
}
