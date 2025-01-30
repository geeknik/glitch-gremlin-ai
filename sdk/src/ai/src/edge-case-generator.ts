import { VulnerabilityType } from './types.js';

export class EdgeCaseGenerator {
    public generateEdgeCases() {
        return [
            {
                name: 'Integer Overflow',
                input: Number.MAX_SAFE_INTEGER,
                expectedError: 'ARITHMETIC_OVERFLOW' as VulnerabilityType
            },
            {
                name: 'Integer Underflow',
                input: Number.MIN_SAFE_INTEGER,
                expectedError: 'ARITHMETIC_OVERFLOW' as VulnerabilityType
            },
            {
                name: 'Invalid Data Length',
                input: Buffer.alloc(1024),
                expectedError: 'ACCESS_CONTROL' as VulnerabilityType
            },
            {
                name: 'Race Condition',
                input: {
                    concurrent: true,
                    delay: 100
                },
                expectedError: 'RACE_CONDITION' as VulnerabilityType
            }
        ];
    }

    generateBoundaryConditions() {
        return [
            {
                type: 'ACCOUNT_SIZE',
                size: 0,
                expectedError: 'DATA_VALIDATION' as VulnerabilityType
            },
            {
                type: 'MAX_ACCOUNTS',
                count: 32,
                expectedError: 'DATA_VALIDATION' as VulnerabilityType
            },
            {
                type: 'RENT_EXEMPTION',
                lamports: 0,
                expectedError: 'LAMPORT_DRAIN' as VulnerabilityType
            }
        ];
    }

    generateExtremeValues() {
        return [
            {
                type: 'MAX_U64',
                value: BigInt('18446744073709551615'),
                expectedError: 'ARITHMETIC_OVERFLOW' as VulnerabilityType
            },
            {
                type: 'MIN_I64',
                value: BigInt('-9223372036854775808'),
                expectedError: 'ARITHMETIC_OVERFLOW' as VulnerabilityType
            },
            {
                type: 'EMPTY_VECTOR',
                value: new Uint8Array(0),
                expectedError: 'DATA_VALIDATION' as VulnerabilityType
            }
        ];
    }

    generateRaceConditions() {
        return [
            {
                type: 'CONCURRENT_WRITE',
                accounts: ['account1', 'account2'],
                instructions: [
                    { write: 'account1' },
                    { write: 'account2' }
                ],
                expectedError: 'RACE_CONDITION' as VulnerabilityType
            },
            {
                type: 'READ_WRITE',
                accounts: ['account1'],
                instructions: [
                    { read: 'account1' },
                    { write: 'account1' }
                ],
                expectedError: 'RACE_CONDITION' as VulnerabilityType
            }
        ];
    }
} 