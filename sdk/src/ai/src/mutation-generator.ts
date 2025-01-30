import { VulnerabilityType, MutationType, SecurityLevel } from '../../types.js';
import { FuzzingMutation } from '../types.js';
import { generateRandomBytes, generateRandomU64 } from '../utils/random.js';

export class MutationGenerator {
    public generatePDAMutations() {
        return [
            {
                name: 'Invalid PDA Seeds',
                input: { seeds: [] },
                expectedError: VulnerabilityType.PDASafety
            },
            {
                name: 'Similar Account',
                input: { similar: true },
                expectedError: VulnerabilityType.AccountValidation
            }
        ];
    }

    public generateDataMutations() {
        return [
            {
                name: 'Invalid Data Size',
                input: Buffer.alloc(0),
                expectedError: VulnerabilityType.AccessControl
            },
            {
                name: 'Malformed Data',
                input: Buffer.from([0xFF, 0xFF]),
                expectedError: VulnerabilityType.AccessControl
            }
        ];
    }

    public generateArithmeticMutations() {
        return [
            {
                name: 'Integer Overflow',
                input: Number.MAX_SAFE_INTEGER,
                expectedError: VulnerabilityType.ArithmeticOverflow
            },
            {
                name: 'Integer Underflow',
                input: Number.MIN_SAFE_INTEGER,
                expectedError: VulnerabilityType.ArithmeticOverflow
            }
        ];
    }

    generatePDAMutation(): FuzzingMutation {
        return {
            type: MutationType.PDA,
            target: 'pda_validation',
            payload: generateRandomBytes(32).toString('hex'),
            securityImpact: SecurityLevel.HIGH,
            description: 'Testing for PDA validation vulnerabilities',
            expectedVulnerability: VulnerabilityType.PDASafety
        };
    }

    generateAccountConfusionMutation(): FuzzingMutation {
        return {
            type: MutationType.TypeCosplay,
            target: 'account_validation',
            payload: generateRandomBytes(32),
            securityImpact: SecurityLevel.HIGH,
            description: 'Testing account confusion',
            expectedVulnerability: VulnerabilityType.AccountValidation
        };
    }

    generateAccessControlMutation(): FuzzingMutation {
        return {
            type: MutationType.AccessControl,
            target: 'authority_check',
            payload: generateRandomBytes(32),
            securityImpact: SecurityLevel.HIGH,
            description: 'Testing access control',
            expectedVulnerability: VulnerabilityType.AccessControl
        };
    }

    generateSignerValidationMutation(): FuzzingMutation {
        return {
            type: MutationType.SignerValidation,
            target: 'signer_check',
            payload: generateRandomBytes(32),
            securityImpact: SecurityLevel.HIGH,
            description: 'Testing signer validation',
            expectedVulnerability: VulnerabilityType.SignerAuthorization
        };
    }

    generateArithmeticMutation(): FuzzingMutation {
        return {
            type: MutationType.Arithmetic,
            target: 'arithmetic_operation',
            payload: generateRandomU64().toString(),
            securityImpact: SecurityLevel.HIGH,
            description: 'Testing arithmetic overflow',
            expectedVulnerability: VulnerabilityType.ArithmeticOverflow
        };
    }

    generateUnderflowMutation(): FuzzingMutation {
        return {
            type: MutationType.Arithmetic,
            target: 'arithmetic_operation',
            payload: '0',
            securityImpact: SecurityLevel.HIGH,
            description: 'Testing arithmetic underflow',
            expectedVulnerability: VulnerabilityType.ArithmeticOverflow
        };
    }

    generateRandomMutation(): FuzzingMutation {
        return {
            type: MutationType.DataValidation,
            target: 'random_mutation',
            payload: generateRandomBytes(32).toString('hex'),
            securityImpact: SecurityLevel.MEDIUM,
            description: 'Random data validation test'
        };
    }
} 