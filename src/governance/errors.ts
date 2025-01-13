export enum ErrorCode {
    // Basic error codes
    INVALID_ARGUMENT = 1000,
    INTERNAL_ERROR = 1001,
    INSUFFICIENT_FUNDS = 1002,
    UNAUTHORIZED = 1003,
    NOT_FOUND = 1004,

    // Governance specific error codes
    PROPOSAL_NOT_FOUND = 1008,
    INSUFFICIENT_VOTE_BALANCE = 1009, 
    PROPOSAL_NOT_ACTIVE = 1010,
    INVALID_PROPOSAL_ID = 1011,
    PROPOSAL_REJECTED = 1012,
    PROPOSAL_NOT_REACHED_QUORUM = 1013,
    INVALID_VOTE = 1014,
    INSUFFICIENT_VOTING_POWER = 1015
}

export class GlitchError extends Error {
    constructor(message: string, public readonly code: ErrorCode) {
        super(message);
        this.name = 'GlitchError';
    }
}

