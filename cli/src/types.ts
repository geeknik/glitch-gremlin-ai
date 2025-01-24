export interface ProgramOptions {
program: string;
}

export interface TestOptions extends ProgramOptions {
type: string;
}

export interface SecurityOptions extends ProgramOptions {}

export const ErrorMessages = {
INVALID_TEST_TYPE: 'Invalid test type',
REQUIRED_PROGRAM: "error: required option '--program' not specified",
INVALID_PROGRAM: 'Error: Invalid program address',
VERSION_ERROR: 'Error reading version information',
SECURITY_ANALYSIS_ERROR: 'Error performing security analysis'
};

export const SuccessMessages = {
SECURITY_REPORT: 'Security Analysis Report',
TEST_SUCCESS: 'Test completed successfully'
};

export class ValidationError extends Error {
constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
}
}

export class SecurityAnalysisError extends Error {
constructor(message: string) {
    super(message);
    this.name = 'SecurityAnalysisError'; 
}
}

export const validateProgramAddress = (address: string): boolean => {
// Add program address validation logic
return Boolean(address && address.length > 0);
};

export const validateTestType = (type: string): boolean => {
const validTypes = ['unit', 'integration', 'e2e'];
return validTypes.includes(type);
};
export enum TestType {
    FUZZ = 'FUZZ',
    LOAD = 'LOAD',
    EXPLOIT = 'EXPLOIT',
    CONCURRENCY = 'CONCURRENCY',
    MUTATION = 'MUTATION'
}
