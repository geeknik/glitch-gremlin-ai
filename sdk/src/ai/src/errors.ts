/**
 * Custom error class for AI-related errors
 */
export class AIError extends Error {
    constructor(message: string, public readonly code?: string) {
        super(message);
        this.name = 'AIError';
    }
}

/**
 * Error thrown when there are issues with the fuzzing process
 */
export class FuzzingError extends AIError {
    constructor(message: string, code?: string) {
        super(message, code);
        this.name = 'FuzzingError';
    }
}

/**
 * Error thrown when there are issues with model operations
 */
export class ModelError extends AIError {
    constructor(message: string, code?: string) {
        super(message, code);
        this.name = 'ModelError';
    }
}

export type MetricsErrorCode = 
    | 'ALREADY_STARTED'
    | 'NOT_STARTED'
    | 'GATHER_ERROR'
    | 'INVALID_METRIC'
    | 'STORAGE_ERROR'
    | 'VISUALIZATION_ERROR'
    | 'CONFIGURATION_ERROR';

/**
 * Error thrown when there are issues with metrics collection
 */
export class MetricsError extends Error {
    public readonly code: MetricsErrorCode;

    constructor(message: string, code: MetricsErrorCode) {
        super(message);
        this.code = code;
        this.name = 'MetricsError';
        Object.setPrototypeOf(this, MetricsError.prototype);
    }

    public static isMetricsError(error: unknown): error is MetricsError {
        return error instanceof MetricsError;
    }

    public toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            stack: this.stack
        };
    }
} 