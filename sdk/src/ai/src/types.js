export var VulnerabilityType;
(function (VulnerabilityType) {
    VulnerabilityType["ArithmeticOverflow"] = "ArithmeticOverflow";
    VulnerabilityType["Reentrancy"] = "Reentrancy";
    VulnerabilityType["AccessControl"] = "AccessControl";
    VulnerabilityType["PDASafety"] = "PDASafety";
    VulnerabilityType["ResourceExhaustion"] = "ResourceExhaustion";
    VulnerabilityType["OutOfBounds"] = "OutOfBounds";
    VulnerabilityType["None"] = "None";
    VulnerabilityType["AccountDataValidation"] = "AccountDataValidation";
    VulnerabilityType["UnhandledError"] = "UnhandledError";
    VulnerabilityType["BufferOverflow"] = "BufferOverflow";
    VulnerabilityType["IntegerOverflow"] = "IntegerOverflow";
})(VulnerabilityType || (VulnerabilityType = {}));
// Error types for improved error handling
export class FuzzerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FuzzerError';
    }
}
export class ValidationError extends FuzzerError {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}
export class ResourceExhaustionError extends FuzzerError {
    constructor(message) {
        super(message);
        this.name = 'ResourceExhaustionError';
    }
}
