import { GlitchError } from './errors.js';

export interface TokenDistribution {
    team: number;        // 15%
    community: number;   // 35%
    treasury: number;    // 20%
    liquidity: number;  // 20%
    advisors: number;   // 10%
}

export interface FeeStructure {
    baseFee: number;
    intensityMultiplier: number;
    durationMultiplier: number;
    testTypeMultipliers: Record<string, number>;
}

export class TokenEconomics {
    private static readonly TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
    private static readonly MIN_STAKE = 1000;
    private static readonly MAX_STAKE = 10_000_000;
    
    private static readonly DEFAULT_DISTRIBUTION: TokenDistribution = {
        team: 0.15,
        community: 0.35,
        treasury: 0.20,
        liquidity: 0.20,
        advisors: 0.10
    };

    private static readonly DEFAULT_FEE_STRUCTURE: FeeStructure = {
        baseFee: 100,
        intensityMultiplier: 1.5,
        durationMultiplier: 1.2,
        testTypeMultipliers: {
            'FUZZ': 1.0,
            'LOAD': 1.2,
            'EXPLOIT': 1.5,
            'CONCURRENCY': 1.3
        }
    };

    public static validateStakeAmount(amount: number): void {
        if (amount < this.MIN_STAKE) {
            throw new GlitchError('Stake amount below minimum required', 3001);
        }
        if (amount > this.MAX_STAKE) {
            throw new GlitchError(`Stake amount cannot exceed ${this.MAX_STAKE}`, 3002);
        }
    }

    public static calculateTestFee(
        testType: string,
        duration: number,
        intensity: number
    ): number {
        if (!this.DEFAULT_FEE_STRUCTURE.testTypeMultipliers[testType]) {
            throw new GlitchError('Invalid test type', 3005);
        }
        const structure = this.DEFAULT_FEE_STRUCTURE;
        const typeMultiplier = structure.testTypeMultipliers[testType] || 1.0;
        
        const intensityFactor = Math.pow(structure.intensityMultiplier, intensity / 5);
        const durationFactor = Math.pow(structure.durationMultiplier, duration / 300);
        
        return Math.floor(
            structure.baseFee * typeMultiplier * intensityFactor * durationFactor
        );
    }

    public static getInitialDistribution(): TokenDistribution {
        return this.DEFAULT_DISTRIBUTION;
    }

    public static calculateRewards(
        stakeAmount: number,
        lockupDuration: number
    ): number {
        // Base APY of 5%, increasing with lockup duration
        const baseAPY = 0.05;
        const durationBonus = (lockupDuration / (365 * 24 * 60 * 60)) * 0.05;
        const effectiveAPY = baseAPY + durationBonus;
        
        return Math.floor(stakeAmount * effectiveAPY);
    }

    public static validateTestParameters(
        duration: number,
        intensity: number
    ): void {
        if (duration < 60 || duration > 3600) {
            throw new GlitchError('Test duration must be between 60 and 3600 seconds', 3003);
        }
        if (intensity < 1 || intensity > 10) {
            throw new GlitchError('Test intensity must be between 1 and 10', 3004);
        }
    }
}
