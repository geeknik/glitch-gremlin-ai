import type { ErrorMetadata, ErrorDetails, BaseErrorDetails } from './types.js';

export enum ErrorCode {
    // System Level Errors
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    INVALID_ARGUMENT = 'INVALID_ARGUMENT',
    INVALID_STATE = 'INVALID_STATE',
    NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
    TIMEOUT = 'TIMEOUT',
    
    // Program Level Errors
    PROGRAM_ERROR = 'PROGRAM_ERROR',
    INVALID_PROGRAM_ID = 'INVALID_PROGRAM_ID',
    INVALID_PROGRAM_ACCOUNT = 'INVALID_PROGRAM_ACCOUNT',
    PROGRAM_EXECUTION_FAILED = 'PROGRAM_EXECUTION_FAILED',
    PROGRAM_UPGRADE_REQUIRED = 'PROGRAM_UPGRADE_REQUIRED',
    PROGRAM_DEPRECATED = 'PROGRAM_DEPRECATED',
    
    // Security Related
    UNAUTHORIZED = 'UNAUTHORIZED',
    INVALID_SIGNATURE = 'INVALID_SIGNATURE',
    INVALID_AUTHORITY = 'INVALID_AUTHORITY',
    SIGNER_VALIDATION_FAILED = 'SIGNER_VALIDATION_FAILED',
    OWNER_VALIDATION_FAILED = 'OWNER_VALIDATION_FAILED',
    PDA_VALIDATION_FAILED = 'PDA_VALIDATION_FAILED',
    BUMP_SEED_MISMATCH = 'BUMP_SEED_MISMATCH',
    
    // Mutation Related
    INVALID_MUTATION_TYPE = 'INVALID_MUTATION_TYPE',
    INVALID_MUTATION_TARGET = 'INVALID_MUTATION_TARGET',
    INVALID_MUTATION_PAYLOAD = 'INVALID_MUTATION_PAYLOAD',
    MUTATION_EXECUTION_FAILED = 'MUTATION_EXECUTION_FAILED',
    
    // Validation Related
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    INVALID_ACCOUNT_DATA = 'INVALID_ACCOUNT_DATA',
    INVALID_INSTRUCTION = 'INVALID_INSTRUCTION',
    ACCOUNT_SIZE_MISMATCH = 'ACCOUNT_SIZE_MISMATCH',
    ACCOUNT_OWNER_MISMATCH = 'ACCOUNT_OWNER_MISMATCH',
    ACCOUNT_NOT_INITIALIZED = 'ACCOUNT_NOT_INITIALIZED',
    
    // Resource Related
    INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
    COMPUTE_BUDGET_EXCEEDED = 'COMPUTE_BUDGET_EXCEEDED',
    MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',

    // Test Related
    TEST_EXECUTION_FAILED = 'TEST_EXECUTION_FAILED',
    TEST_TIMEOUT = 'TEST_TIMEOUT',
    TEST_VALIDATION_FAILED = 'TEST_VALIDATION_FAILED',
    
    // Redis Related
    REDIS_ERROR = 'REDIS_ERROR',
    REDIS_NOT_CONFIGURED = 'REDIS_NOT_CONFIGURED',
    REDIS_CONNECTION_FAILED = 'REDIS_CONNECTION_FAILED',
    
    // Governance Related
    PROPOSAL_CREATION_FAILED = 'PROPOSAL_CREATION_FAILED',
    PROPOSAL_NOT_ACTIVE = 'PROPOSAL_NOT_ACTIVE',
    ALREADY_VOTED = 'ALREADY_VOTED',
    INSUFFICIENT_VOTING_POWER = 'INSUFFICIENT_VOTING_POWER',
    INVALID_VOTE = 'INVALID_VOTE',
    INVALID_PROPOSAL_FORMAT = 'INVALID_PROPOSAL_FORMAT',
    
    // Staking Related
    STAKE_CREATION_FAILED = 'STAKE_CREATION_FAILED',
    STAKE_NOT_FOUND = 'STAKE_NOT_FOUND',
    INVALID_STAKE_STATUS = 'INVALID_STAKE_STATUS',
    UNSTAKE_FAILED = 'UNSTAKE_FAILED',
    INVALID_STAKE_AMOUNT = 'INVALID_STAKE_AMOUNT',
    INVALID_LOCKUP_PERIOD = 'INVALID_LOCKUP_PERIOD',

    // Additional Error Codes
    INVALID_AMOUNT = 'INVALID_AMOUNT',
    INVALID_TEST_TYPE = 'INVALID_TEST_TYPE',
    INVALID_SECURITY_LEVEL = 'INVALID_SECURITY_LEVEL',
    INVALID_EXECUTION_ENVIRONMENT = 'INVALID_EXECUTION_ENVIRONMENT',
    INVALID_DURATION = 'INVALID_DURATION',
    INVALID_INTENSITY = 'INVALID_INTENSITY'
}

export function createErrorMetadata(
    error: Error | string,
    context: {
        programId?: string;
        instruction?: string;
        accounts?: string[];
        value?: string | number | boolean | null;
        payload?: string | number | boolean | null;
    } = {}
): ErrorMetadata {
    return {
        programId: context.programId || '',
        instruction: context.instruction || '',
        error: error instanceof Error ? error.message : error,
        accounts: context.accounts || [],
        value: context.value || null,
        payload: context.payload || null,
        mutation: {
            type: '',
            target: '',
            payload: null
        },
        securityContext: {
            environment: 'testnet',
            upgradeable: false,
            validations: {
                ownerChecked: false,
                signerChecked: false,
                accountDataMatched: false,
                pdaVerified: false,
                bumpsMatched: false
            }
        }
    };
}

interface EnhancedError extends Error {
    code: ErrorCode;
    details: ErrorDetails;
    toJSON(): {
        name: string;
        message: string;
        code: ErrorCode;
        details: ErrorDetails;
    };
}

type ErrorDetailsInput = {
    metadata?: Partial<ErrorMetadata>;
    source?: {
        file?: string;
        line?: number;
        function?: string;
    };
};

function createErrorDetails(
    code: ErrorCode,
    message: string,
    metadata: ErrorMetadata,
    error: Error,
    source?: ErrorDetailsInput['source']
): ErrorDetails {
    return {
        code,
        message,
        metadata,
        timestamp: Date.now(),
        stackTrace: error.stack || '',
        source: {
            file: source?.file || '',
            line: source?.line || 0,
            function: source?.function || ''
        }
    };
}

export function createError(
    code: ErrorCode,
    message: string,
    input?: ErrorDetailsInput
): EnhancedError {
    const error = new Error(message);
    const metadata = createErrorMetadata(message, input?.metadata);
    const errorDetails = createErrorDetails(code, message, metadata, error, input?.source);

    const enhancedError = Object.assign(error, {
        code,
        details: errorDetails,
        toJSON(): {
            name: string;
            message: string;
            code: ErrorCode;
            details: ErrorDetails;
        } {
            return {
                name: error.name,
                message: error.message,
                code,
                details: errorDetails
            };
        }
    });

    return enhancedError as EnhancedError;
}

export class GlitchError extends Error {
    constructor(
        message: string, 
        public code: ErrorCode, 
        public details?: ErrorDetails
    ) {
        super(message);
        this.name = 'GlitchError';
        
        // Initialize default error details if not provided
        if (!this.details) {
            this.details = createErrorDetails(
                this.code,
                this.message,
                createErrorMetadata(this.message),
                this
            );
        }
    }

    public toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details,
            stack: this.stack
        };
    }
}

// Specialized error classes
export class InsufficientFundsError extends GlitchError {
    constructor(message: string, metadata?: Partial<ErrorMetadata>) {
        super(
            message, 
            ErrorCode.INSUFFICIENT_FUNDS,
            createErrorDetails(
                ErrorCode.INSUFFICIENT_FUNDS,
                message,
                createErrorMetadata(message, metadata),
                new Error(message)
            )
        );
    }
}

export class ValidationError extends GlitchError {
    constructor(message: string, metadata?: Partial<ErrorMetadata>) {
        super(
            message, 
            ErrorCode.VALIDATION_ERROR,
            createErrorDetails(
                ErrorCode.VALIDATION_ERROR,
                message,
                createErrorMetadata(message, metadata),
                new Error(message)
            )
        );
    }
}

export class UnauthorizedError extends GlitchError {
    constructor(message: string, metadata?: Partial<ErrorMetadata>) {
        super(
            message, 
            ErrorCode.UNAUTHORIZED,
            createErrorDetails(
                ErrorCode.UNAUTHORIZED,
                message,
                createErrorMetadata(message, metadata),
                new Error(message)
            )
        );
    }
}

export class RequestTimeoutError extends GlitchError {
    constructor(message: string, metadata?: Partial<ErrorMetadata>) {
        super(
            message, 
            ErrorCode.TIMEOUT,
            createErrorDetails(
                ErrorCode.TIMEOUT,
                message,
                createErrorMetadata(message, metadata),
                new Error(message)
            )
        );
    }
}

export class ProgramError extends GlitchError {
    constructor(message: string, metadata?: Partial<ErrorMetadata>) {
        super(
            message, 
            ErrorCode.PROGRAM_ERROR,
            createErrorDetails(
                ErrorCode.PROGRAM_ERROR,
                message,
                createErrorMetadata(message, metadata),
                new Error(message)
            )
        );
    }
}

export class SecurityError extends GlitchError {
    constructor(message: string, code: ErrorCode, metadata?: Partial<ErrorMetadata>) {
        super(
            message, 
            code,
            createErrorDetails(
                code,
                message,
                createErrorMetadata(message, metadata),
                new Error(message)
            )
        );
    }
}

export function isGlitchError(error: unknown): error is GlitchError {
    return error instanceof GlitchError;
}

export function isSecurityError(error: unknown): error is SecurityError {
    return error instanceof SecurityError;
}

export function isProgramError(error: unknown): error is ProgramError {
    return error instanceof ProgramError;
}
