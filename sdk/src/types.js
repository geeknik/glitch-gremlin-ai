export var TestType;
(function (TestType) {
    TestType["FUZZ"] = "FUZZ";
    TestType["LOAD"] = "LOAD";
    TestType["EXPLOIT"] = "EXPLOIT";
    TestType["CONCURRENCY"] = "CONCURRENCY";
})(TestType || (TestType = {}));
export var VulnerabilityType;
(function (VulnerabilityType) {
    VulnerabilityType["Reentrancy"] = "reentrancy";
    VulnerabilityType["ArithmeticOverflow"] = "arithmetic-overflow";
    VulnerabilityType["AccessControl"] = "access-control";
    VulnerabilityType["RaceCondition"] = "race-condition";
    VulnerabilityType["InstructionInjection"] = "instruction-injection";
    VulnerabilityType["AccountConfusion"] = "account-confusion";
    VulnerabilityType["SignerAuthorization"] = "signer-authorization";
    VulnerabilityType["PdaValidation"] = "pda-validation";
    VulnerabilityType["ClockManipulation"] = "clock-manipulation";
    VulnerabilityType["LamportDrain"] = "lamport-drain";
})(VulnerabilityType || (VulnerabilityType = {}));
export var ProposalState;
(function (ProposalState) {
    ProposalState["Draft"] = "draft";
    ProposalState["Active"] = "active";
    ProposalState["Succeeded"] = "succeeded";
    ProposalState["Defeated"] = "defeated";
    ProposalState["Executed"] = "executed";
    ProposalState["Cancelled"] = "cancelled";
    ProposalState["Queued"] = "queued";
    ProposalState["Expired"] = "expired";
})(ProposalState || (ProposalState = {}));
//# sourceMappingURL=types.js.map