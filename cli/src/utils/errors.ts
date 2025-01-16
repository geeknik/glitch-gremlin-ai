/**
* Enumeration of all possible error codes in the CLI
*/
/**
 * Enumeration of all possible error codes in the CLI
 */
export enum ErrorCode {
    MISSING_PROGRAM_ADDRESS = 'MISSING_PROGRAM_ADDRESS',
    INVALID_PROGRAM_ADDRESS = 'INVALID_PROGRAM_ADDRESS', 
    INVALID_TEST_TYPE = 'INVALID_TEST_TYPE',
    SECURITY_ANALYSIS_FAILED = 'SECURITY_ANALYSIS_FAILED',
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR'
}

/**
 * Error messages for each error code
 */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
    [ErrorCode.MISSING_PROGRAM_ADDRESS]: "error: required option '--program' not specified",
    [ErrorCode.INVALID_PROGRAM_ADDRESS]: "Invalid program address format",
    [ErrorCode.INVALID_TEST_TYPE]: "Invalid test type", 
    [ErrorCode.SECURITY_ANALYSIS_FAILED]: "Error analyzing program",
    [ErrorCode.NETWORK_ERROR]: "Network error occurred during analysis",
    [ErrorCode.TIMEOUT_ERROR]: "Analysis timed out"
};

/**
 * Custom error class for CLI errors
 */
export class CLIError extends Error {
    constructor(public code: ErrorCode, message?: string) {
        super(message || ERROR_MESSAGES[code]);
        this.name = 'CLIError';
    }
}

/**
 * Formats an error message for a given error code
 */
export function formatErrorMessage(code: ErrorCode, customMessage?: string): string {
    const baseMessage = ERROR_MESSAGES[code];
    return customMessage ? `${baseMessage}: ${customMessage}` : baseMessage;
}

/**
 * Throws a CLI error with the given code
 */
export function throwCLIError(code: ErrorCode, customMessage?: string): never {
    throw new CLIError(code, customMessage);
}
