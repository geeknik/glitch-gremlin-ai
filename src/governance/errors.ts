export enum ErrorCode {
    // Basic errors (1000-1099)
    INVALID_ARGUMENT = 1000,
    INTERNAL_ERROR = 1001,
    INSUFFICIENT_FUNDS = 1002,
    UNAUTHORIZED = 1003,
    NOT_FOUND = 1004,
    RATE_LIMIT_EXCEEDED = 1005,
    NETWORK_ERROR = 1006,
    TIMEOUT = 1007,
    INVALID_STATE = 1008,
    CONFIGURATION_ERROR = 1009,
    INVALID_WALLET = 1010,

    // Token & Staking errors (1100-1199)
    INVALID_AMOUNT = 1100,
    STAKE_TOO_LOW = 1101,
    STAKE_TOO_HIGH = 1102,
    INVALID_LOCKUP_PERIOD = 1103,
    STAKE_NOT_FOUND = 1104,
    STAKE_LOCKED = 1105,
    NO_REWARDS_AVAILABLE = 1106,
    INSUFFICIENT_TREASURY_BALANCE = 1107,
    STAKE_ALREADY_DELEGATED = 1108,
    INVALID_DELEGATION = 1109,
    INVALID_STAKE_ID = 1110,

    // Governance errors (1200-1299)
    PROPOSAL_NOT_FOUND = 1200,
    INSUFFICIENT_VOTE_BALANCE = 1201,
    PROPOSAL_NOT_ACTIVE = 1202,
    INVALID_PROPOSAL_DATA = 1203,
    INVALID_VOTING_PERIOD = 1204,
    INVALID_PROPOSAL_ID = 1205,
    PROPOSAL_REJECTED = 1206,
    PROPOSAL_NOT_REACHED_QUORUM = 1207,
    INVALID_VOTE = 1208,
    INSUFFICIENT_VOTING_POWER = 1209,
    VOTING_PERIOD_ENDED = 1210,
    PROPOSAL_EXECUTION_FAILED = 1211,

    // Chaos Testing errors (1300-1399)
    INVALID_TEST_TYPE = 1300,
    TEST_DURATION_EXCEEDED = 1301,
    TEST_INTENSITY_INVALID = 1302,
    TEST_ALREADY_RUNNING = 1303,
    TEST_RESULTS_UNAVAILABLE = 1304,
    TEST_CONFIGURATION_ERROR = 1305,

    // AI Engine errors (1400-1499)
    MODEL_NOT_TRAINED = 1400,
    MODEL_PREDICTION_FAILED = 1401,
    MODEL_LOAD_ERROR = 1402,
    MODEL_SAVE_ERROR = 1403,
    INSUFFICIENT_TRAINING_DATA = 1404
}

export interface ErrorDetails {
    timestamp: number;
    requestId?: string;
    metadata?: Record<string, unknown>;
    stack?: string;
    context?: Record<string, unknown>;
}


export class GlitchError extends Error {
    public readonly code: ErrorCode;
    public readonly details: ErrorDetails;

    constructor(message: string, code: ErrorCode, details?: Partial<ErrorDetails>) {
        super(message);
        this.name = 'GlitchError';
        this.code = code;
        this.details = {
            timestamp: Date.now(),
            ...details
        };

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GlitchError);
        }
    }
}

export class InvalidArgumentError extends GlitchError {
    constructor(details?: Partial<ErrorDetails>) {
        super('Invalid argument provided', ErrorCode.INVALID_ARGUMENT, details);
    }
}

export class RateLimitExceededError extends GlitchError {
    constructor(details?: Partial<ErrorDetails>) {
        super('Rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED, details);
    }
}

export class InvalidStateError extends GlitchError {
    constructor(details?: Partial<ErrorDetails>) {
        super('Invalid system state', ErrorCode.INVALID_STATE, details);
    }
}

export function validateGgaiWallet(pubkey: PublicKey) {
    if (!pubkey.toString().endsWith('ggai')) {
        throw new GlitchError(
            'Invalid Glitch Gremlin wallet format',
            ErrorCode.INVALID_WALLET,
            { received: pubkey.toString() }
        );
    }

    public toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details
        };
    }

    public static fromError(error: unknown, code: ErrorCode = ErrorCode.INTERNAL_ERROR): GlitchError {
        if (error instanceof GlitchError) {
            return error;
        }
        
        const message = error instanceof Error ? error.message : 'Unknown error';
        const details: ErrorDetails = {
            timestamp: Date.now(),
            stack: error instanceof Error ? error.stack : undefined
        };

        return new GlitchError(message, code, details);
    }
}

