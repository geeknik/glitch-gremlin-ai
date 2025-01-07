import { GlitchError } from './errors';
export class TokenEconomics {
    static TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
    static MIN_STAKE = 1000;
    static MAX_STAKE = 10_000_000;
    static DEFAULT_DISTRIBUTION = {
        team: 0.15,
        community: 0.35,
        treasury: 0.20,
        liquidity: 0.20,
        advisors: 0.10
    };
    static DEFAULT_FEE_STRUCTURE = {
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
    static validateStakeAmount(amount) {
        if (amount < this.MIN_STAKE) {
            throw new GlitchError('Stake amount below minimum required', 3001);
        }
        if (amount > this.MAX_STAKE) {
            throw new GlitchError(`Stake amount cannot exceed ${this.MAX_STAKE}`, 3002);
        }
    }
    static calculateTestFee(testType, duration, intensity) {
        const structure = this.DEFAULT_FEE_STRUCTURE;
        const typeMultiplier = structure.testTypeMultipliers[testType] || 1.0;
        const intensityFactor = Math.pow(structure.intensityMultiplier, intensity / 5);
        const durationFactor = Math.pow(structure.durationMultiplier, duration / 300);
        return Math.floor(structure.baseFee * typeMultiplier * intensityFactor * durationFactor);
    }
    static getInitialDistribution() {
        return this.DEFAULT_DISTRIBUTION;
    }
    static calculateRewards(stakeAmount, lockupDuration) {
        // Base APY of 5%, increasing with lockup duration
        const baseAPY = 0.05;
        const durationBonus = (lockupDuration / (365 * 24 * 60 * 60)) * 0.05;
        const effectiveAPY = baseAPY + durationBonus;
        return Math.floor(stakeAmount * effectiveAPY);
    }
    static validateTestParameters(duration, intensity) {
        if (duration < 60 || duration > 3600) {
            throw new GlitchError('Test duration must be between 60 and 3600 seconds', 3003);
        }
        if (intensity < 1 || intensity > 10) {
            throw new GlitchError('Test intensity must be between 1 and 10', 3004);
        }
    }
}
