export enum ErrorCode {
    // Request and validation errors (1000-1099)
    INSUFFICIENT_FUNDS = 1001,
    INVALID_PROGRAM = 1002,
    REQUEST_TIMEOUT = 1003,
    INVALID_TEST_TYPE = 1004,
    INVALID_INTENSITY = 1005,
    INVALID_DURATION = 1006,
    RATE_LIMIT_EXCEEDED = 1007,
    INVALID_JSON = 1008,
    TREASURY_ERROR = 1009,
    INVALID_AMOUNT = 1010,
    // Voting and balance errors (1000-1099) 
    INSUFFICIENT_VOTE_BALANCE = 1009,
    ALREADY_VOTED = 1010,
    INVALID_PROPOSAL_ID = 1011,
    TIMELOCK_NOT_ELAPSED_VOTING = 1012,

    // Staking and balance errors (1100-1199)
    INSUFFICIENT_STAKE = 1101,
    INSUFFICIENT_BALANCE = 1102,
    STAKE_TOO_LOW = 1103, 
    STAKE_TOO_HIGH = 1104,
    STAKE_NOT_FOUND = 1105,
    TOKENS_LOCKED = 1106,
    INVALID_LOCKUP = 1107,
    INVALID_DELEGATION_PERCENTAGE = 1108,
    STAKE_ALREADY_DELEGATED = 1109,
    NO_REWARDS_AVAILABLE = 1110,
    INVALID_LOCKUP_PERIOD = 1014,
    STAKE_NOT_FOUND_WITHDRAW = 1015,
    TOKENS_STILL_LOCKED = 1016,
    // Test configuration errors (1200-1299)
    INVALID_TEST_DURATION = 1201,
    INVALID_TEST_INTENSITY = 1202,

    // Governance errors (2000-2099)
    INSUFFICIENT_VOTING_POWER = 2001,
    PROPOSAL_NOT_FOUND = 2002,
    PROPOSAL_NOT_ACTIVE = 2003,
    INVALID_VOTE = 2004,
    VOTING_PERIOD_ENDED = 2005,
    PROPOSAL_ALREADY_EXECUTED = 2006,
    PROPOSAL_NOT_REACHED_QUORUM = 2007,
    PROPOSAL_REJECTED = 2008,
    INVALID_PROPOSAL_FORMAT = 2009,
    TIMELOCK_NOT_ELAPSED = 2010,
    INSUFFICIENT_STAKE = 2011,
    DELEGATION_NOT_ALLOWED = 2012,
    EMERGENCY_PAUSE_ACTIVE = 2013,
    PROPOSAL_ENDED = 2015,
    PROPOSAL_EXECUTION_FAILED = 2014,
    
    // Connection and system errors (5000-5099)
    CONNECTION_ERROR = 5001
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
