import { TokenEconomics } from '../token-economics';
import { GlitchError } from '../errors';

describe('TokenEconomics', () => {
    describe('fee calculation', () => {
        it('should calculate base fees correctly', () => {
            const fee = TokenEconomics.calculateTestFee('FUZZ', 300, 5);
            expect(fee).toBeGreaterThan(0);
            expect(typeof fee).toBe('number');
        });

        it('should scale fees with test type', () => {
            const fuzzFee = TokenEconomics.calculateTestFee('FUZZ', 300, 5);
            const exploitFee = TokenEconomics.calculateTestFee('EXPLOIT', 300, 5);
            expect(exploitFee).toBeGreaterThan(fuzzFee);
        });

        it('should scale fees with duration', () => {
            const shortTest = TokenEconomics.calculateTestFee('FUZZ', 300, 5);
            const longTest = TokenEconomics.calculateTestFee('FUZZ', 600, 5);
            expect(longTest).toBeGreaterThan(shortTest);
        });

        it('should scale fees with intensity', () => {
            const lowIntensity = TokenEconomics.calculateTestFee('FUZZ', 300, 2);
            const highIntensity = TokenEconomics.calculateTestFee('FUZZ', 300, 8);
            expect(highIntensity).toBeGreaterThan(lowIntensity);
        });
    });

    describe('stake validation', () => {
        it('should validate minimum stake', () => {
            expect(() => TokenEconomics.validateStakeAmount(100))
                .toThrow('Stake amount must be at least 1000');
        });

        it('should validate maximum stake', () => {
            expect(() => TokenEconomics.validateStakeAmount(20_000_000))
                .toThrow('Stake amount cannot exceed 10000000');
        });

        it('should accept valid stake amounts', () => {
            expect(() => TokenEconomics.validateStakeAmount(5000))
                .not.toThrow();
        });
    });

    describe('rewards calculation', () => {
        it('should calculate staking rewards', () => {
            const rewards = TokenEconomics.calculateRewards(10000, 365 * 24 * 60 * 60);
            expect(rewards).toBeGreaterThan(0);
        });

        it('should increase rewards with longer lockup', () => {
            const shortLockup = TokenEconomics.calculateRewards(10000, 30 * 24 * 60 * 60);
            const longLockup = TokenEconomics.calculateRewards(10000, 365 * 24 * 60 * 60);
            expect(longLockup).toBeGreaterThan(shortLockup);
        });
    });

    describe('test parameter validation', () => {
        it('should validate duration range', () => {
            expect(() => TokenEconomics.validateTestParameters(30, 5))
                .toThrow('Test duration must be between 60 and 3600 seconds');
        });

        it('should validate intensity range', () => {
            expect(() => TokenEconomics.validateTestParameters(300, 11))
                .toThrow('Test intensity must be between 1 and 10');
        });

        it('should accept valid parameters', () => {
            expect(() => TokenEconomics.validateTestParameters(300, 5))
                .not.toThrow();
        });
    });
});
