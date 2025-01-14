/** Types of chaos engineering tests that can be performed */
export enum TestType {
    /** Fuzz testing to find edge cases and crashes */
    FUZZ = 'FUZZ',
    
    /** Load testing to verify performance under stress */
    LOAD = 'LOAD',
    
    /** Security testing to find vulnerabilities */
    SECURITY = 'SECURITY',
    
    /** Network partition testing */
    NETWORK = 'NETWORK'
}

/** Vulnerability types that can be detected by the security analysis */
export enum VulnerabilityType {
/** Program crashes or panics due to unhandled errors */
Crash = 'Crash',

/** Buffer overflow vulnerabilities that can corrupt memory */
BufferOverflow = 'BufferOverflow',

/** Integer overflow/underflow vulnerabilities */
ArithmeticOverflow = 'ArithmeticOverflow',

/** Reentrancy vulnerabilities allowing multiple concurrent calls */
Reentrancy = 'Reentrancy',

/** Access control or authorization bypass vulnerabilities */
AccessControl = 'AccessControl',

/** General program logic errors and bugs */
LogicError = 'LogicError'
}

/** States that a governance proposal can be in during its lifecycle */
export enum ProposalState {
/** Initial state when proposal is first created but not yet activated */
Draft = 'Draft',

/** Proposal is active and accepting votes */
Active = 'Active',

/** Proposal has passed voting and met quorum requirements */
Succeeded = 'Succeeded',

/** Proposal failed to meet voting threshold or quorum requirements */
Defeated = 'Defeated',  

/** Proposal instructions have been executed successfully */
Executed = 'Executed',

/** Proposal was cancelled before execution */
Cancelled = 'Cancelled'
}
