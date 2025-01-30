import { TokenEconomics } from '../token-economics';
import { TestType } from '../types';

describe('TokenEconomics', () => {
    describe('fee calculation', () => {
        it('should throw for invalid test types', () => {
            expect(() => TokenEconomics.calculateTestFee('INVALID', 300, 5))
                .toThrow('Invalid test type');
        });

        it('should calculate base fees correctly', () => {
            const fee = TokenEconomics.calculateTestFee(TestType.ARITHMETIC_OVERFLOW, 300, 5);
            expect(fee).toBe(300 * 5 * TokenEconomics.BASE_FEE_MULTIPLIER);
        });

        it('should apply intensity multiplier', () => {
            const lowIntensity = TokenEconomics.calculateTestFee(TestType.ACCESS_CONTROL, 300, 1);
            const highIntensity = TokenEconomics.calculateTestFee(TestType.ACCESS_CONTROL, 300, 10);
            expect(highIntensity).toBeGreaterThan(lowIntensity);
        });

        it('should apply duration multiplier', () => {
            const shortDuration = TokenEconomics.calculateTestFee(TestType.REENTRANCY, 60, 5);
            const longDuration = TokenEconomics.calculateTestFee(TestType.REENTRANCY, 3600, 5);
            expect(longDuration).toBeGreaterThan(shortDuration);
        });

        it('should enforce minimum fees', () => {
            const fee = TokenEconomics.calculateTestFee(TestType.ARITHMETIC_OVERFLOW, 60, 1);
            expect(fee).toBeGreaterThanOrEqual(TokenEconomics.MIN_FEE);
        });
    });

    describe('burn rate calculation', () => {
        it('should calculate burn rate based on test type', () => {
            const criticalBurn = TokenEconomics.calculateBurnRate(TestType.REENTRANCY);
            const standardBurn = TokenEconomics.calculateBurnRate(TestType.ACCESS_CONTROL);
            expect(criticalBurn).toBeGreaterThan(standardBurn);
        });

        it('should enforce minimum burn rate', () => {
            const burnRate = TokenEconomics.calculateBurnRate(TestType.ARITHMETIC_OVERFLOW);
            expect(burnRate).toBeGreaterThanOrEqual(TokenEconomics.MIN_BURN_RATE);
        });
    });

    describe('reward calculation', () => {
        it('should calculate validator rewards', () => {
            const reward = TokenEconomics.calculateValidatorReward(1000, TestType.REENTRANCY);
            expect(reward).toBe(1000 * TokenEconomics.VALIDATOR_REWARD_MULTIPLIER);
        });

        it('should calculate bug bounty rewards', () => {
            const bounty = TokenEconomics.calculateBugBounty(TestType.ARITHMETIC_OVERFLOW, 9);
            expect(bounty).toBeGreaterThan(0);
            expect(bounty).toBeLessThanOrEqual(TokenEconomics.MAX_BUG_BOUNTY);
        });
    });

    describe('governance staking', () => {
        it('should calculate voting power', () => {
            const power = TokenEconomics.calculateVotingPower(1000, 365);
            expect(power).toBeGreaterThan(1000);
        });

        it('should calculate early unstake penalty', () => {
            const penalty = TokenEconomics.calculateUnstakePenalty(1000, 0.5);
            expect(penalty).toBe(500); // 50% penalty
        });
    });
});
