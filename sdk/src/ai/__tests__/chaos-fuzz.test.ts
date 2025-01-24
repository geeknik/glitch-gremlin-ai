import { jest } from '@jest/globals';
import { ChaosGenerator, ChaosConfig } from '../chaosGenerator';
import { VulnerabilityType } from '../src/types';
import { FuzzInput } from '../src/types';

describe('ChaosGenerator', () => {
    let chaosGenerator: ChaosGenerator;
    const defaultConfig: ChaosConfig = {
        mutationRate: 0.1,
        maxChaosLevel: 5,
        targetVulnerabilities: [VulnerabilityType.ArithmeticOverflow as any]
    };

    beforeEach(() => {
        chaosGenerator = new ChaosGenerator(defaultConfig);
    });

    describe('initialization', () => {
        it('should create with default configuration', () => {
            const generator = new ChaosGenerator();
            expect(generator).toBeDefined();
        });

        it('should create with custom configuration', () => {
            const generator = new ChaosGenerator(defaultConfig);
            expect(generator).toBeDefined();
        });
    });

    describe('enhanceInput', () => {
        const mockInput: FuzzInput = {
            instruction: 100,
            data: new Uint8Array([1, 2, 3, 4]),
            probability: 0.5,
            metadata: {},
            created: Date.now()
        };

        it('should enhance input based on chaos level', () => {
            const chaosLevel = 3;
            const enhanced = chaosGenerator.enhanceInput(mockInput, chaosLevel);
            
            expect(enhanced).toBeDefined();
            expect(enhanced.instruction).toBeDefined();
            expect(enhanced.data).toBeDefined();
            expect(enhanced.probability).toBeDefined();
            expect(enhanced.probability).toBeGreaterThanOrEqual(mockInput.probability);
        });

        it('should respect maximum chaos level', () => {
            expect(() => {
                chaosGenerator.enhanceInput(mockInput, defaultConfig.maxChaosLevel + 1);
            }).toThrow();
        });

        it('should increase mutation probability with chaos level', () => {
            const lowChaos = chaosGenerator.enhanceInput(mockInput, 1);
            const highChaos = chaosGenerator.enhanceInput(mockInput, 4);
            
            expect(highChaos.probability).toBeGreaterThan(lowChaos.probability);
        });

        it('should maintain data length after mutation', () => {
            const enhanced = chaosGenerator.enhanceInput(mockInput, 3);
            expect(enhanced.data.length).toBe(mockInput.data.length);
        });
    });

    describe('edge cases', () => {
        it('should handle empty input data', () => {
            const emptyInput: FuzzInput = {
                instruction: 0,
                data: new Uint8Array(),
                probability: 0.5,
                metadata: {},
                created: Date.now()
            };
            
            const enhanced = chaosGenerator.enhanceInput(emptyInput, 1);
            expect(enhanced.data.length).toBe(0);
        });

        it('should handle maximum instruction values', () => {
            const maxInput: FuzzInput = {
                instruction: 255,
                data: new Uint8Array([255, 255]),
                probability: 1.0,
                metadata: {},
                created: Date.now()
            };
            
            const enhanced = chaosGenerator.enhanceInput(maxInput, 1);
            expect(enhanced.instruction).toBeLessThanOrEqual(255);
            expect(enhanced.instruction).toBeGreaterThanOrEqual(0);
        });
    });
});
