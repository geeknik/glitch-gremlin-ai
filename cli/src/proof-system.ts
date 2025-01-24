export function generateSecurityProof(programAddress: string): Promise<string> {
    return Promise.resolve(`proof-${programAddress}-${Date.now()}`);
}
