import { BN } from '@project-serum/anchor';

export function generateRandomBytes(length: number): Buffer {
    return Buffer.from(Array(length).fill(0).map(() => Math.floor(Math.random() * 256)));
}

export function generateRandomU64(): BN {
    const buffer = generateRandomBytes(8);
    return new BN(buffer);
}

export function generateRandomSeed(length = 32): string {
    return generateRandomBytes(length).toString('hex');
}

export function generateRandomPubkey(): Buffer {
    return generateRandomBytes(32);
}

export function generateRandomAmount(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomBool(): boolean {
    return Math.random() > 0.5;
}

export function pickRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

export function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
} 