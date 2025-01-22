export enum ErrorCode {
    MISSING_PROGRAM_ADDRESS = 'MISSING_PROGRAM_ADDRESS',
    INVALID_PROGRAM_ADDRESS = 'INVALID_PROGRAM_ADDRESS', 
    INVALID_TEST_TYPE = 'INVALID_TEST_TYPE',
    SECURITY_ANALYSIS_FAILED = 'SECURITY_ANALYSIS_FAILED',
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR'
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
    [ErrorCode.MISSING_PROGRAM_ADDRESS]: "error: required option '--program' not specified",
    [ErrorCode.INVALID_PROGRAM_ADDRESS]: "Invalid program address format",
    [ErrorCode.INVALID_TEST_TYPE]: "Invalid test type specified",
    // Enhanced error messages from DESIGN.md 10
    [ErrorCode.SECURITY_ANALYSIS_FAILED]: "Security analysis failed - potential vulnerability detected",
    [ErrorCode.NETWORK_ERROR]: "Network error - verify connection and retry",
    [ErrorCode.TIMEOUT_ERROR]: "Operation timed out - increase timeout with --max-wait"
};

export class CLIError extends Error {
    constructor(public code: ErrorCode, message?: string) {
        super(message || ERROR_MESSAGES[code]);
        this.name = 'CLIError';
        Error.captureStackTrace?.(this, CLIError);
    }
}

export function formatErrorMessage(code: ErrorCode, customMessage?: string): string {
    return `✖ ${customMessage || ERROR_MESSAGES[code]}\n`;
}

export function throwCLIError(code: ErrorCode, customMessage?: string): never {
    throw new CLIError(code, customMessage);
}
