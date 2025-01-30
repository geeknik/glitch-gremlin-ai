import { GlitchError, ErrorCode } from './errors.js';
import { TestType, ChaosRequestParams } from './types.js';

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
    testTypeMultipliers: Record<TestType, number>;
}

export class TokenEconomics {
    private readonly MIN_STAKE = 1_000_000; // 1 GREMLINAI
    private readonly MAX_STAKE = 1_000_000_000; // 1000 GREMLINAI
    private readonly MIN_DURATION = 60; // 60 seconds
    private readonly MAX_DURATION = 3600; // 1 hour
    private readonly MIN_INTENSITY = 1;
    private readonly MAX_INTENSITY = 10;
    private readonly BASE_APY = 0.1; // 10% base APY
    private readonly MAX_APY = 0.3; // 30% max APY
    private readonly BASE_FEE = 100; // Base fee in GREMLINAI
    private readonly INTENSITY_MULTIPLIER = 1.5;
    private readonly DURATION_MULTIPLIER = 1.2;

    private readonly TEST_TYPE_MULTIPLIERS: Record<TestType, number> = {
        [TestType.NETWORK_LATENCY]: 1.0,
        [TestType.PACKET_LOSS]: 1.2,
        [TestType.MEMORY_PRESSURE]: 1.3,
        [TestType.CPU_PRESSURE]: 1.3,
        [TestType.DISK_PRESSURE]: 1.2,
        [TestType.FUZZ]: 1.5,
        [TestType.CONCURRENCY]: 1.4
    };

    private readonly DEFAULT_DISTRIBUTION: TokenDistribution = {
        team: 0.15,      // 15%
        community: 0.35, // 35%
        treasury: 0.20,  // 20%
        liquidity: 0.20, // 20%
        advisors: 0.10   // 10%
    };

    constructor() {}

    public validateStakeAmount(amount: number): void {
        if (!amount || amount <= 0) {
            throw new GlitchError(
                'Stake amount below minimum required', 
                ErrorCode.INVALID_STAKE_AMOUNT
            );
        }

        if (amount > this.MAX_STAKE) {
            throw new GlitchError(
                `Stake amount cannot exceed ${this.MAX_STAKE}`, 
                ErrorCode.INVALID_STAKE_AMOUNT
            );
        }
    }

    public validateTestType(testType: TestType): void {
        if (!Object.values(TestType).includes(testType)) {
            throw new GlitchError(
                'Invalid test type', 
                ErrorCode.VALIDATION_ERROR
            );
        }
    }

    public validateTestParameters(params: ChaosRequestParams): void {
        // Validate test type
        this.validateTestType(params.testType);

        // Validate duration
        if (!params.duration || params.duration < this.MIN_DURATION || params.duration > this.MAX_DURATION) {
            throw new GlitchError(
                'Test duration must be between 60 and 3600 seconds', 
                ErrorCode.VALIDATION_ERROR
            );
        }

        // Validate intensity
        if (params.intensity && (params.intensity < this.MIN_INTENSITY || params.intensity > this.MAX_INTENSITY)) {
            throw new GlitchError(
                'Test intensity must be between 1 and 10', 
                ErrorCode.VALIDATION_ERROR
            );
        }
    }

    public calculateStakingRequirement(params: ChaosRequestParams): number {
        let baseStake = this.MIN_STAKE;

        // Adjust based on test type
        const typeMultiplier = this.TEST_TYPE_MULTIPLIERS[params.testType] || 1.0;
        baseStake *= typeMultiplier;

        // Adjust based on duration
        const durationMultiplier = params.duration / this.MIN_DURATION;
        baseStake *= Math.min(2, durationMultiplier);

        // Adjust based on intensity
        if (params.intensity) {
            const intensityMultiplier = params.intensity / this.MIN_INTENSITY;
            baseStake *= Math.min(3, intensityMultiplier);
        }

        // Cap at maximum stake
        return Math.min(baseStake, this.MAX_STAKE);
    }

    public calculateReward(params: ChaosRequestParams): number {
        const baseReward = this.calculateStakingRequirement(params) * this.BASE_APY;
        
        // Bonus for longer duration
        const durationBonus = (params.duration / this.MAX_DURATION) * 0.05; // Up to 5% bonus
        
        // Bonus for higher intensity
        const intensityBonus = params.intensity ? (params.intensity / this.MAX_INTENSITY) * 0.05 : 0; // Up to 5% bonus
        
        // Bonus for test type complexity
        const typeMultiplier = this.TEST_TYPE_MULTIPLIERS[params.testType] || 1.0;
        const typeBonus = (typeMultiplier - 1) * 0.1; // Up to 10% bonus based on test type
        
        // Calculate total reward with bonuses, capped at MAX_APY
        const totalMultiplier = Math.min(1 + durationBonus + intensityBonus + typeBonus, this.MAX_APY / this.BASE_APY);
        return baseReward * totalMultiplier;
    }

    public calculateTestFee(params: ChaosRequestParams): number {
        this.validateTestParameters(params);
        
        const typeMultiplier = this.TEST_TYPE_MULTIPLIERS[params.testType] || 1.0;
        const intensityFactor = Math.pow(this.INTENSITY_MULTIPLIER, (params.intensity || 1) / 5);
        const durationFactor = Math.pow(this.DURATION_MULTIPLIER, params.duration / 300);
        
        return Math.floor(this.BASE_FEE * typeMultiplier * intensityFactor * durationFactor);
    }

    public getInitialDistribution(): TokenDistribution {
        return { ...this.DEFAULT_DISTRIBUTION };
    }

    public calculateLockupRewards(stakeAmount: number, lockupDuration: number): number {
        // Base APY of 5%, increasing with lockup duration
        const baseAPY = 0.05;
        const durationBonus = (lockupDuration / (365 * 24 * 60 * 60)) * 0.05;
        const effectiveAPY = Math.min(baseAPY + durationBonus, this.MAX_APY);
        
        return Math.floor(stakeAmount * effectiveAPY);
    }
}
