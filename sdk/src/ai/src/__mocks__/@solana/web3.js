// Mock necessary classes and methods
class MockConnection {
    constructor(endpoint) {
        this._rpcEndpoint = endpoint;
        this.getAccountInfo = jest.fn();
        this.getBalance = jest.fn();
        this.getRecentBlockhash = jest.fn().mockResolvedValue({
            blockhash: 'mock-blockhash',
            feeCalculator: { lamportsPerSignature: 5000 }
        });
        this.sendTransaction = jest.fn().mockResolvedValue('mock-signature');
        this.confirmTransaction = jest.fn().mockResolvedValue({ value: { err: null } });
        this.simulateTransaction = jest.fn().mockResolvedValue({ value: { err: null } });
        this.getVersion = jest.fn().mockResolvedValue({
            "solana-core": '1.11.0'
        });
        this.getProgramAccounts = jest.fn();
    }
}


class MockPublicKey {
    constructor(key) {
        this._bn = key;
    }
    toString() {
        return this._bn.toString();
    }
    equals(other) {
        return this._bn.toString() === other.toString();
    }
    toBase58() {
        return this._bn.toString();
    }
    toBytes() {
        return new Uint8Array(32);
    }
}

class MockTransaction {
    constructor() {
        this.instructions = [];
    }
    add(instruction) {
        this.instructions.push(instruction);
        return this;
    }
}

class MockTransactionInstruction {
    constructor(keys, programId, data) {
        this.keys = keys;
        this.programId = programId;
        this.data = data;
    }
}

const SystemProgram = {
    programId: new MockPublicKey('11111111111111111111111111111111'),
};

const mockConnectionInstance = new MockConnection('http://localhost'); // Create an instance

module.exports = {
    Connection: jest.fn(() => mockConnectionInstance), // Return the instance
    PublicKey: MockPublicKey,
    Transaction: MockTransaction,
    TransactionInstruction: MockTransactionInstruction,
    SystemProgram: SystemProgram,
    LAMPORTS_PER_SOL: 1000000000,
    sendAndConfirmTransaction: jest.fn(),
    sendAndConfirmRawTransaction: jest.fn(),
    clusterApiUrl: jest.fn(),
};
