export enum ErrorCode {
    // Request and validation errors (1000-1099)
    INSUFFICIENT_FUNDS = 1001,
    INVALID_PROGRAM = 1002,
    INVALID_PROGRAM_ADDRESS = 1003,
    REQUEST_TIMEOUT = 1004,
    INVALID_TEST_TYPE = 1005,
    INVALID_INTENSITY = 1006,
    INVALID_DURATION = 1007,
    RATE_LIMIT_EXCEEDED = 1008,
    INVALID_JSON = 1009,
    TREASURY_ERROR = 1010,
    INVALID_AMOUNT = 1011,
    STAKE_TOO_LOW = 1012,
    STAKE_TOO_HIGH = 1013,
    INVALID_TEST_DURATION = 1014,
    INVALID_TEST_INTENSITY = 1015,
    // Voting and balance errors (1015-1019)
    INSUFFICIENT_VOTE_BALANCE = 1016,
    ALREADY_VOTED = 1017, 
    INVALID_PROPOSAL_ID = 1018,
    TIMELOCK_NOT_ELAPSED_VOTING = 1019,

    // Staking and balance errors (1100-1199)
    INSUFFICIENT_STAKE = 1100,
    INSUFFICIENT_BALANCE = 1101,
    STAKE_NOT_FOUND = 1102,
    TOKENS_LOCKED = 1103,
    INVALID_LOCKUP = 1104,
    INVALID_DELEGATION_PERCENTAGE = 1105,
    STAKE_ALREADY_DELEGATED = 1106,
    NO_REWARDS_AVAILABLE = 1107,
    INVALID_LOCKUP_PERIOD = 1108,
    STAKE_NOT_FOUND_WITHDRAW = 1109,
    TOKENS_STILL_LOCKED = 1110,

    // Governance errors (2000-2099)
    INSUFFICIENT_VOTING_POWER = 2001,
    PROPOSAL_NOT_FOUND = 2002,
    PROPOSAL_NOT_ACTIVE = 2003,
    INVALID_VOTE = 2004,
    INVALID_STATE = 2005,
    VOTING_PERIOD_ENDED = 2006,
    PROPOSAL_ALREADY_EXECUTED = 2007,
    INSUFFICIENT_QUORUM = 2008,
    PROPOSAL_FAILED = 2009,
    PROPOSAL_REJECTED = 2010,
    INVALID_PROPOSAL_FORMAT = 2011,
    TIMELOCK_NOT_ELAPSED = 2012,
    DELEGATION_NOT_ALLOWED = 2013,
    EMERGENCY_PAUSE_ACTIVE = 2014,
    PROPOSAL_EXECUTION_FAILED = 2015,
    PROPOSAL_ENDED = 2016,
    
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
