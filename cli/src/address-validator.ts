export function validateProgramAddress(address: string): void {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        throw new Error('Invalid program address format');
    }
}
