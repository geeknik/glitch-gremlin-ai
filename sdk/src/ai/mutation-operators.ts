import { PublicKey, SystemProgram, AccountMeta } from '@solana/web3.js';
import { BN } from 'bn.js';

export interface MutationStrategy {
name: string;
description: string;
probability: number;
mutate: (input: any) => any;
}

export class AccountMutationOperators {
static readonly FLIP_SIGNER = {
    name: 'FlipSigner',
    description: 'Toggles the is_signer flag on account metas',
    probability: 0.3,
    mutate: (accountMeta: AccountMeta) => ({
    ...accountMeta,
    isSigner: !accountMeta.isSigner
    })
};

static readonly FLIP_WRITABLE = {
    name: 'FlipWritable',
    description: 'Toggles the is_writable flag on account metas',
    probability: 0.3,
    mutate: (accountMeta: AccountMeta) => ({
    ...accountMeta,
    isWritable: !accountMeta.isWritable
    })
};

static readonly REPLACE_WITH_SYSTEM_PROGRAM = {
    name: 'ReplaceWithSystemProgram',
    description: 'Replaces account with SystemProgram ID',
    probability: 0.2,
    mutate: (accountMeta: AccountMeta) => ({
    ...accountMeta,
    pubkey: SystemProgram.programId
    })
};
}

export class PDAMutationOperators {
static readonly BUMP_MODIFICATION = {
    name: 'BumpModification',
    description: 'Modifies PDA bump seed value',
    probability: 0.25,
    mutate: (bump: number) => (bump + 1) % 256
};

static readonly SEED_MODIFICATION = {
    name: 'SeedModification',
    description: 'Modifies PDA seed components',
    probability: 0.25,
    mutate: (seeds: Buffer[]) => {
    const index = Math.floor(Math.random() * seeds.length);
    const newSeeds = [...seeds];
    newSeeds[index] = Buffer.from(Math.random().toString());
    return newSeeds;
    }
};
}

export class InstructionDataMutationOperators {
static readonly BYTE_FLIP = {
    name: 'ByteFlip',
    description: 'Flips random bytes in instruction data',
    probability: 0.3,
    mutate: (data: Buffer) => {
    const mutated = Buffer.from(data);
    const position = Math.floor(Math.random() * data.length);
    mutated[position] = mutated[position] ^ 0xFF;
    return mutated;
    }
};

static readonly LENGTH_MODIFICATION = {
    name: 'LengthModification',
    description: 'Modifies instruction data length',
    probability: 0.2,
    mutate: (data: Buffer) => {
    const newLength = Math.max(0, data.length + (Math.random() > 0.5 ? 1 : -1));
    return Buffer.alloc(newLength).fill(data);
    }
};
}

export class AuthorityMutationOperators {
static readonly AUTHORITY_REPLACEMENT = {
    name: 'AuthorityReplacement',
    description: 'Replaces authority with different pubkey',
    probability: 0.25,
    mutate: (authority: PublicKey) => new PublicKey(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 256))
    )
};

static readonly REMOVE_AUTHORITY = {
    name: 'RemoveAuthority',
    description: 'Removes authority checks',
    probability: 0.2,
    mutate: () => SystemProgram.programId
};
}

export class AccountDataMutationOperators {
static readonly TYPE_CONFUSION = {
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
};

static readonly BOUNDARY_VALUES = {
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
};
}

export class CPIMutationOperators {
static readonly PROGRAM_ID_MUTATION = {
    name: 'ProgramIdMutation',
    description: 'Mutates program ID in CPI calls',
    probability: 0.25,
    mutate: (programId: PublicKey) => new PublicKey(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 256))
    )
};

static readonly CPI_ACCOUNT_REORDERING = {
    name: 'CPIAccountReordering',
    description: 'Reorders accounts in CPI calls',
    probability: 0.25,
    mutate: (accounts: AccountMeta[]) => {
    return [...accounts].sort(() => Math.random() - 0.5);
    }
};
}

export class SeedDerivationMutationOperators {
static readonly SEED_LENGTH_MUTATION = {
    name: 'SeedLengthMutation',
    description: 'Modifies seed length in derivation',
    probability: 0.25,
    mutate: (seed: Buffer) => {
    const newLength = Math.max(0, seed.length + (Math.random() > 0.5 ? 1 : -1));
    return Buffer.alloc(newLength).fill(seed);
    }
};

static readonly SEED_CONTENT_MUTATION = {
    name: 'SeedContentMutation',
    description: 'Modifies seed content in derivation',
    probability: 0.25,
    mutate: (seed: Buffer) => {
    const mutated = Buffer.from(seed);
    const position = Math.floor(Math.random() * seed.length);
    mutated[position] = Math.floor(Math.random() * 256);
    return mutated;
    }
};
}

export class MutationOperatorRegistry {
private static operators: MutationStrategy[] = [
    ...Object.values(AccountMutationOperators),
    ...Object.values(PDAMutationOperators),
    ...Object.values(InstructionDataMutationOperators),
    ...Object.values(AuthorityMutationOperators),
    ...Object.values(AccountDataMutationOperators),
    ...Object.values(CPIMutationOperators),
    ...Object.values(SeedDerivationMutationOperators)
];

static getRandomOperator(): MutationStrategy {
    return this.operators[Math.floor(Math.random() * this.operators.length)];
}

static getOperatorsByCategory(category: string): MutationStrategy[] {
    const categoryMap = {
    'account': AccountMutationOperators,
    'pda': PDAMutationOperators,
    'instruction': InstructionDataMutationOperators,
    'authority': AuthorityMutationOperators,
    'data': AccountDataMutationOperators,
    'cpi': CPIMutationOperators,
    'seed': SeedDerivationMutationOperators
    };
    return Object.values(categoryMap[category] || {});
}
}

