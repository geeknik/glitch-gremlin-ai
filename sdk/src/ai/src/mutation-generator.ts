import { VulnerabilityType } from '@/types.js';

export class MutationGenerator {
    public generatePDAMutations() {
        return [
            {
                name: 'Invalid PDA Seeds',
                input: { seeds: [] },
                expectedError: VulnerabilityType.PDA_SAFETY
            },
            {
                name: 'Similar Account',
                input: { similar: true },
                expectedError: VulnerabilityType.ACCOUNT_CONFUSION
            }
        ];
    }

    public generateDataMutations() {
        return [
            {
                name: 'Invalid Data Size',
                input: Buffer.alloc(0),
                expectedError: VulnerabilityType.ACCESS_CONTROL
            },
            {
                name: 'Malformed Data',
                input: Buffer.from([0xFF, 0xFF]),
                expectedError: VulnerabilityType.ACCESS_CONTROL
            }
        ];
    }

    public generateArithmeticMutations() {
        return [
            {
                name: 'Integer Overflow',
                input: Number.MAX_SAFE_INTEGER,
                expectedError: VulnerabilityType.ARITHMETIC_OVERFLOW
            },
            {
                name: 'Integer Underflow',
                input: Number.MIN_SAFE_INTEGER,
                expectedError: VulnerabilityType.ARITHMETIC_OVERFLOW
            }
        ];
    }
} 