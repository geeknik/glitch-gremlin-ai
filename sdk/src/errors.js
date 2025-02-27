export class GlitchError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'GlitchError';
    }
}
export class InsufficientFundsError extends GlitchError {
    constructor() {
        super('Insufficient $GREMLINAI tokens for chaos request', 1001);
    }
}
export class InvalidProgramError extends GlitchError {
    constructor() {
        super('Invalid target program address', 1002);
    }
}
export class RequestTimeoutError extends GlitchError {
    constructor() {
        super('Chaos request timed out', 1003);
    }
}
