export enum ErrorCode {
    INSUFFICIENT_FUNDS = 1001,
    INVALID_PROGRAM = 1002,
    REQUEST_TIMEOUT = 1003,
    INVALID_TEST_TYPE = 1004,
    INVALID_INTENSITY = 1005,
    INVALID_DURATION = 1006,
    RATE_LIMIT_EXCEEDED = 1007,
    INSUFFICIENT_STAKE = 1008,
    INSUFFICIENT_BALANCE = 1009,
    ALREADY_VOTED = 1010,
    INVALID_PROPOSAL_FORMAT = 1011,
    TIMELOCK_NOT_ELAPSED = 1012,
    PROPOSAL_REJECTED = 1013,
    INVALID_LOCKUP = 1014,
    STAKE_NOT_FOUND = 1015,
    TOKENS_LOCKED = 1016,
    STAKE_TOO_LOW = 1017,
    STAKE_TOO_HIGH = 1018,
    INVALID_TEST_DURATION = 1019,
    INVALID_TEST_INTENSITY = 1020,
    // Governance specific error codes
    INSUFFICIENT_VOTING_POWER = 2001,
    PROPOSAL_NOT_FOUND = 2002,
    PROPOSAL_NOT_ACTIVE = 2003,
    INVALID_VOTE = 2004,
    PROPOSAL_ALREADY_EXECUTED = 2005,
    PROPOSAL_VOTING_ENDED = 2006
}

export interface ErrorDetails {
    timestamp?: number;
    requestId?: string;
    metadata?: Record<string, unknown>;
}

export class GlitchError extends Error {
    constructor(message: string, public code: ErrorCode, public details?: ErrorDetails) {
        super(message);
        this.name = 'GlitchError';
        
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GlitchError);
        }
    }
    
    toJSON(): Record<string, unknown> {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
            stack: this.stack
        };
    }
}

export class InsufficientFundsError extends GlitchError {
    constructor(details?: ErrorDetails) {
        super('Insufficient $GREMLINAI tokens for chaos request', ErrorCode.INSUFFICIENT_FUNDS, details);
    }
}

export class InvalidProgramError extends GlitchError {
    constructor(details?: ErrorDetails) {
        super('Invalid target program address', ErrorCode.INVALID_PROGRAM, details);
    }
}

export class RequestTimeoutError extends GlitchError {
    constructor(details?: ErrorDetails) {
        super('Chaos request timed out', ErrorCode.REQUEST_TIMEOUT, details);
    }
}
