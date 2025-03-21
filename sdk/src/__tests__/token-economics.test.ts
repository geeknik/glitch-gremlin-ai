import { TokenEconomics, TestType } from '../token-economics.js';
import { GlitchError, ErrorCode } from '../errors.js';

describe('TokenEconomics', () => {
    describe('fee calculation', () => {
        it('should throw for invalid test types', () => {
            expect(() => TokenEconomics.calculateTestFee('INVALID' as any, 300, 5))
                .toThrow('Invalid test type');
        });

        it('should calculate fees for all test types', () => {
            const types = [TestType.FUZZ, TestType.LOAD, TestType.EXPLOIT, TestType.CONCURRENCY];
            types.forEach(type => {
                const fee = TokenEconomics.calculateTestFee(type, 300, 5);
                expect(fee).toBeGreaterThan(0);
            });
        });

        it('should handle edge case parameters', () => {
            const minFee = TokenEconomics.calculateTestFee(TestType.FUZZ, 60, 1);
            const maxFee = TokenEconomics.calculateTestFee(TestType.EXPLOIT, 3600, 10);
            expect(minFee).toBeLessThan(maxFee);
        });
        it('should calculate base fees correctly', () => {
            const fee = TokenEconomics.calculateTestFee(TestType.FUZZ, 300, 5);
            expect(fee).toBeGreaterThan(0);
            expect(typeof fee).toBe('number');
        });

        it('should scale fees with test type', () => {
            const fuzzFee = TokenEconomics.calculateTestFee(TestType.FUZZ, 300, 5);
            const exploitFee = TokenEconomics.calculateTestFee(TestType.EXPLOIT, 300, 5);
            expect(exploitFee).toBeGreaterThan(fuzzFee);
        });

        it('should scale fees with duration', () => {
            const shortTest = TokenEconomics.calculateTestFee(TestType.FUZZ, 300, 5);
            const longTest = TokenEconomics.calculateTestFee(TestType.FUZZ, 600, 5);
            expect(longTest).toBeGreaterThan(shortTest);
        });

        it('should scale fees with intensity', () => {
            const lowIntensity = TokenEconomics.calculateTestFee(TestType.FUZZ, 300, 2);
            const highIntensity = TokenEconomics.calculateTestFee(TestType.FUZZ, 300, 8);
            expect(highIntensity).toBeGreaterThan(lowIntensity);
        });
    });

    describe('stake validation', () => {
        it('should validate minimum stake', () => {
            expect(() => TokenEconomics.validateStakeAmount(100))
                .toThrow('Stake amount below minimum required');
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
