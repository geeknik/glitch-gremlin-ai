import { PublicKey, SystemProgram, AccountMeta } from '@solana/web3.js';
import BN from 'bn.js';

export interface MutationStrategy {
    name: string;
    description: string;
    probability: number;
    mutate: (input: any) => any;
}

export type MutationCategory = 
    | 'account'
    | 'pda'
    | 'instruction'
    | 'authority'
    | 'data'
    | 'cpi'
    | 'seed';

export type MutationOperator = MutationStrategy;

export const AccountMutationOperators = {
    FLIP_SIGNER: {
        name: 'FlipSigner',
        description: 'Toggles the is_signer flag on account metas',
        probability: 0.3,
        mutate: (accountMeta: AccountMeta) => ({
            ...accountMeta,
            isSigner: !accountMeta.isSigner
        })
    },

    FLIP_WRITABLE: {
        name: 'FlipWritable',
        description: 'Toggles the is_writable flag on account metas',
        probability: 0.3,
        mutate: (accountMeta: AccountMeta) => ({
            ...accountMeta,
            isWritable: !accountMeta.isWritable
        })
    },

    REPLACE_WITH_SYSTEM_PROGRAM: {
        name: 'ReplaceWithSystemProgram',
        description: 'Replaces account with SystemProgram ID',
        probability: 0.2,
        mutate: (accountMeta: AccountMeta) => ({
            ...accountMeta,
            pubkey: SystemProgram.programId
        })
    },

    FLIP_EXECUTABLE: {
        name: 'Flip Executable Flag',
        description: 'Flips the executable flag of an account',
        probability: 0.3,
        mutate: (account: any) => ({
            ...account,
            executable: !account.executable
        })
    },

    ZERO_LAMPORTS: {
        name: 'Zero Lamports',
        description: 'Sets account lamports to zero',
        probability: 0.3,
        mutate: (account: any) => ({
            ...account,
            lamports: 0
        })
    }
} as const;

export const PDAMutationOperators = {
    BUMP_MODIFICATION: {
        name: 'BumpModification',
        description: 'Modifies PDA bump seed value',
        probability: 0.25,
        mutate: (bump: number) => (bump + 1) % 256
    },

    SEED_MODIFICATION: {
        name: 'SeedModification',
        description: 'Modifies PDA seed components',
        probability: 0.25,
        mutate: (seeds: Buffer[]) => {
            const index = Math.floor(Math.random() * seeds.length);
            const newSeeds = [...seeds];
            newSeeds[index] = Buffer.from(Math.random().toString());
            return newSeeds;
        }
    },

    INVALID_SEED: {
        name: 'Invalid Seed',
        description: 'Replaces a valid seed with an invalid one',
        probability: 0.25,
        mutate: (seeds: Buffer[]) => {
            const newSeeds = [...seeds];
            const randomIndex = Math.floor(Math.random() * seeds.length);
            newSeeds[randomIndex] = Buffer.from([0xFF, 0xFF]);
            return newSeeds;
        }
    },

    EMPTY_SEEDS: {
        name: 'Empty Seeds',
        description: 'Removes all seeds',
        probability: 0.25,
        mutate: () => []
    }
} as const;

export const InstructionDataMutationOperators = {
    BYTE_FLIP: {
        name: 'ByteFlip',
        description: 'Flips random bytes in instruction data',
        probability: 0.3,
        mutate: (data: Buffer) => {
            const mutated = Buffer.from(data);
            const position = Math.floor(Math.random() * data.length);
            mutated[position] = mutated[position] ^ 0xFF;
            return mutated;
        }
    },

    LENGTH_MODIFICATION: {
        name: 'LengthModification',
        description: 'Modifies instruction data length',
        probability: 0.2,
        mutate: (data: Buffer) => {
            const newLength = Math.max(0, data.length + (Math.random() > 0.5 ? 1 : -1));
            return Buffer.alloc(newLength).fill(data);
        }
    },

    RANDOMIZE_DATA: {
        name: 'Randomize Data',
        description: 'Replaces instruction data with random bytes',
        probability: 0.3,
        mutate: (data: Buffer) => {
            const newData = Buffer.alloc(data.length);
            for (let i = 0; i < data.length; i++) {
                newData[i] = Math.floor(Math.random() * 256);
            }
            return newData;
        }
    },

    TRUNCATE_DATA: {
        name: 'Truncate Data',
        description: 'Truncates instruction data',
        probability: 0.2,
        mutate: (data: Buffer) => data.slice(0, Math.floor(data.length / 2))
    }
} as const;

export const AuthorityMutationOperators = {
    AUTHORITY_REPLACEMENT: {
        name: 'AuthorityReplacement',
        description: 'Replaces authority with different pubkey',
        probability: 0.25,
        mutate: (authority: PublicKey) => new PublicKey(
            Array(32).fill(0).map(() => Math.floor(Math.random() * 256))
        )
    },

    REMOVE_AUTHORITY: {
        name: 'RemoveAuthority',
        description: 'Removes authority checks',
        probability: 0.2,
        mutate: () => SystemProgram.programId
    },

    REMOVE_SIGNERS: {
        name: 'Remove Signers',
        description: 'Removes all signers from the transaction',
        probability: 0.2,
        mutate: (keys: AccountMeta[]) => keys.map(key => ({ ...key, isSigner: false }))
    },

    FLIP_WRITABLE: {
        name: 'Flip Writable',
        description: 'Flips the writable flag for account keys',
        probability: 0.2,
        mutate: (keys: AccountMeta[]) => keys.map(key => ({ ...key, isWritable: !key.isWritable }))
    }
} as const;

export const AccountDataMutationOperators = {
    TYPE_CONFUSION: {
        name: 'TypeConfusion',
        description: 'Introduces type confusion in account data',
        probability: 0.25,
        mutate: (data: Buffer) => {
            const mutated = Buffer.from(data);
            // Modify discriminator or type identifier bytes
            for (let i = 0; i < 8 && i < data.length; i++) {
                mutated[i] = Math.floor(Math.random() * 256);
            }
            return mutated;
        }
    },

    BOUNDARY_VALUES: {
        name: 'BoundaryValues',
        description: 'Replaces numeric fields with boundary values',
        probability: 0.25,
        mutate: (value: BN) => {
            const boundaries = [
                new BN(0),
                new BN(-1),
                new BN(1),
                new BN(2).pow(new BN(64)).subn(1),
                new BN(2).pow(new BN(64))
            ];
            return boundaries[Math.floor(Math.random() * boundaries.length)];
        }
    },

    OVERFLOW_U64: {
        name: 'Overflow U64',
        description: 'Attempts to overflow a u64 value',
        probability: 0.25,
        mutate: () => new BN('18446744073709551615')
    },

    UNDERFLOW_I64: {
        name: 'Underflow I64',
        description: 'Attempts to underflow an i64 value',
        probability: 0.25,
        mutate: () => new BN('-9223372036854775808')
    }
} as const;

export const CPIMutationOperators = {
    PROGRAM_ID_MUTATION: {
        name: 'ProgramIdMutation',
        description: 'Mutates program ID in CPI calls',
        probability: 0.25,
        mutate: (programId: PublicKey) => new PublicKey(
            Array(32).fill(0).map(() => Math.floor(Math.random() * 256))
        )
    },

    CPI_ACCOUNT_REORDERING: {
        name: 'CPIAccountReordering',
        description: 'Reorders accounts in CPI calls',
        probability: 0.25,
        mutate: (accounts: AccountMeta[]) => {
            return [...accounts].sort(() => Math.random() - 0.5);
        }
    },

    INVALID_PROGRAM_ID: {
        name: 'Invalid Program ID',
        description: 'Uses an invalid program ID for CPI',
        probability: 0.25,
        mutate: () => new PublicKey(Array(32).fill(0))
    },

    MISSING_ACCOUNTS: {
        name: 'Missing Accounts',
        description: 'Removes required accounts from CPI',
        probability: 0.25,
        mutate: (accounts: AccountMeta[]) => accounts.slice(1)
    }
} as const;

export const SeedDerivationMutationOperators = {
    SEED_LENGTH_MUTATION: {
        name: 'SeedLengthMutation',
        description: 'Modifies PDA seed length',
        probability: 0.25,
        mutate: (seeds: Buffer[]) => {
            return Math.random() > 0.5 ? seeds.slice(1) : [...seeds, Buffer.from('extra')];
        }
    },

    SEED_CONTENT_MUTATION: {
        name: 'SeedContentMutation',
        description: 'Modifies PDA seed content',
        probability: 0.25,
        mutate: (seeds: Buffer[]) => {
            return seeds.map(seed => {
                const mutated = Buffer.from(seed);
                const position = Math.floor(Math.random() * seed.length);
                mutated[position] = mutated[position] ^ 0xFF;
                return mutated;
            });
        }
    },

    INVALID_BUMP: {
        name: 'Invalid Bump',
        description: 'Uses an invalid bump seed',
        probability: 0.25,
        mutate: () => 255
    },

    EXTRA_SEEDS: {
        name: 'Extra Seeds',
        description: 'Adds extra seeds to PDA derivation',
        probability: 0.25,
        mutate: (seeds: Buffer[]) => [...seeds, Buffer.from('extra1'), Buffer.from('extra2')]
    }
} as const;

export class MutationOperatorRegistry {
    private static readonly categoryMap: Record<MutationCategory, Record<string, MutationStrategy>> = {
        'account': AccountMutationOperators,
        'pda': PDAMutationOperators,
        'instruction': InstructionDataMutationOperators,
        'authority': AuthorityMutationOperators,
        'data': AccountDataMutationOperators,
        'cpi': CPIMutationOperators,
        'seed': SeedDerivationMutationOperators
    };

    static getRandomOperator(): MutationStrategy {
        const categories = Object.values(this.categoryMap);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const operators = Object.values(randomCategory);
        return operators[Math.floor(Math.random() * operators.length)];
    }

    static getOperatorsByCategory(category: MutationCategory): MutationStrategy[] {
        return Object.values(this.categoryMap[category] || {});
    }
}

