//! TLA+ specification embedded as a string constant
pub const TLA_SPEC: &str = r#"
EXTENDS Integers, Sequences, TLC

VARIABLES coverage, vulnerabilities, executions

Init == 
    /\ coverage = [i ∈ 0..1023 |-> 0]
    /\ vulnerabilities = {}
    /\ executions = 0
    
Next ==
    \E instr ∈ FuzzInstructions:
        /\ executions' = executions + 1
        /\ \A e ∈ Edges(instr):
            coverage' = [coverage EXCEPT ![e] = @ + 1]
        /\ vulnerabilities' = 
            IF DetectVulnerability(instr)
            THEN vulnerabilities ∪ {instr.id}
            ELSE vulnerabilities
            
Invariants ==
    AllCoverageMonotonic ∧
    VulnerabilityConsistency ∧
    ExecutionBound(MAX_EXECUTIONS)
    
THEOREM Spec ⇒ □Invariants
"#;
