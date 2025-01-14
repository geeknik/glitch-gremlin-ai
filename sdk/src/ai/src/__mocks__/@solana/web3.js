class PublicKey {
constructor(key) {
    this._key = key;
}

toString() {
    return this._key;
}

equals(other) {
    return this._key === other._key;
}

static createWithSeed(base, seed, programId) {
    return new PublicKey(`${base.toString()}-${seed}-${programId.toString()}`);
}

toBytes() {
    return new Uint8Array(32);
}
}

class TransactionInstruction {
    constructor(config) {
        this.keys = config.keys || [];
        this.programId = config.programId;
        this.data = config.data || Buffer.from([]);
    }
}

class Transaction {
    constructor(options = {}) {
        this.signatures = [];
        this.instructions = [];
        this.recentBlockhash = options.recentBlockhash || 'mock-blockhash';
        this.feePayer = options.feePayer;
    }

add(...instructions) {
    this.instructions.push(...instructions);
}

sign(...signers) {
    this.signatures = signers.map(signer => ({
    signature: new Uint8Array(64),
    publicKey: signer.publicKey
    }));
}

serialize() {
    return new Uint8Array(100);
}
}

class Connection {
constructor(endpoint, commitment) {
    this.endpoint = endpoint;
    this.commitment = commitment;
}

async getAccountInfo(publicKey) {
    return {
    data: new Uint8Array(0),
    executable: false,
    lamports: 1000000000,
    owner: new PublicKey('mock-owner'),
    rentEpoch: 0
    };
}

async getBalance(publicKey) {
    return 1000000000;
}

async getProgramAccounts(programId) {
    return [];
}

async sendTransaction(transaction, signers) {
    return 'mock-signature';
}

async getRecentBlockhash() {
    return {
    blockhash: 'mock-blockhash',
    feeCalculator: { lamportsPerSignature: 5000 }
    };
}
}

module.exports = {
    PublicKey,
    Transaction,
    TransactionInstruction,
    Connection,
    SystemProgram: {
    programId: new PublicKey('11111111111111111111111111111111'),
    createAccount: () => ({
    programId: new PublicKey('11111111111111111111111111111111'),
    keys: [],
    data: new Uint8Array(0)
    })
}
};

