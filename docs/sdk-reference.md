# Glitch Gremlin SDK Reference

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](../sdk/package.json)

## Installation

```bash
npm install @glitch-gremlin/sdk
```

## Core Concepts

### GlitchSDK

The main class for interacting with the Glitch Gremlin platform.

```typescript
import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';

const sdk = new GlitchSDK({
    cluster: 'devnet',  // or 'mainnet-beta'
    wallet: yourWallet  // Solana wallet instance
});
```

## API Reference

### Chaos Testing

#### createChaosRequest
Creates a new chaos test request.

```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Program ID to test",
    testType: TestType.FUZZ,
    duration: 300,    // seconds
    intensity: 5      // 1-10 scale
});
```

Parameters:
- `targetProgram`: PublicKey or string of program to test
- `testType`: FUZZ | LOAD | EXPLOIT | CONCURRENCY
- `duration`: 60-3600 seconds
- `intensity`: 1-10 scale
- `params?`: Optional test-specific parameters

Returns:
```typescript
{
    requestId: string;
    waitForCompletion: () => Promise<ChaosResult>;
}
```

#### getRequestStatus
Get status of an existing request.

```typescript
const status = await sdk.getRequestStatus("request-id");
```

Returns:
```typescript
{
    requestId: string;
    status: 'completed' | 'failed';
    resultRef: string;  // IPFS/Arweave reference
    logs: string[];
    metrics?: {
        totalTransactions: number;
        errorRate: number;
        avgLatency: number;
    };
}
```

### Governance

#### createProposal
Create a new governance proposal.

```typescript
const proposal = await sdk.createProposal({
    title: "Test Popular DEX",
    description: "Run chaos tests on XYZ DEX",
    targetProgram: "DEX_PROGRAM_ID",
    testParams: {
        testType: TestType.EXPLOIT,
        duration: 600,
        intensity: 8
    },
    stakingAmount: 1000
});
```

Parameters:
- `title`: Proposal title
- `description`: Detailed description
- `targetProgram`: Program to test
- `testParams`: ChaosRequestParams
- `stakingAmount`: Amount of GLITCH to stake

Returns:
```typescript
{
    id: string;
    signature: string;
}
```

#### vote
Vote on a governance proposal.

```typescript
const txSignature = await sdk.vote(proposalId, true);
```

### Staking

#### stakeTokens
Stake GLITCH tokens.

```typescript
const txSignature = await sdk.stakeTokens(
    amount,     // Amount to stake
    lockupPeriod // Duration in seconds
);
```

Parameters:
- `amount`: Number of tokens to stake
- `lockupPeriod`: Lock duration (86400-31536000 seconds)

#### unstakeTokens
Unstake previously staked tokens.

```typescript
const txSignature = await sdk.unstakeTokens(stakeId);
```

### Token Economics

#### calculateChaosRequestFee
Calculate the fee for a chaos request.

```typescript
const fee = await sdk.calculateChaosRequestFee({
    testType: TestType.FUZZ,
    duration: 300,
    intensity: 5
});
```

## Smart Contract Integration

Example of integrating with governance smart contracts:

```typescript
import { PublicKey, Transaction } from '@solana/web3.js'
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/vue'
import { useAppKitConnection } from '@reown/appkit-adapter-solana/vue'

const { address } = useAppKitAccount()
const { connection } = useAppKitConnection()
const { walletProvider } = useAppKitProvider('solana')

async function createProposal(title: string, description: string) {
  const programId = new PublicKey('GremlinGov11111111111111111111111111111111111')
  
  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: address, isSigner: true, isWritable: false },
      // Add other accounts
    ],
    data: Buffer.from([0]) // Proposal creation instruction
  })

  const tx = new Transaction().add(instruction)
  tx.feePayer = address
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

  await walletProvider.signAndSendTransaction(tx)
}

## Error Handling

The SDK throws `GlitchError` with specific error codes:

```typescript
try {
    await sdk.createChaosRequest(params);
} catch (error) {
    if (error instanceof GlitchError) {
        console.error(`Error ${error.code}: ${error.message}`);
    }
}
```

Common error codes:
- 1001: Insufficient funds
- 1002: Invalid program address
- 1003: Request timeout
- 1004: Invalid test type
- 1005: Invalid intensity
- 1006: Invalid duration
- 1007: Rate limit exceeded
- 1008: Insufficient stake amount
- 1009: Insufficient voting balance
- 1010: Already voted
- 1011: Invalid proposal ID
- 1012: Execution failed
- 1013: Proposal not passed
- 1014: Invalid lockup period
- 1015: Stake not found
- 1016: Tokens still locked
- 1008: Insufficient stake amount
- 1009: Insufficient voting balance
- 1010: Already voted
- 1011: Invalid proposal ID
- 1012: Execution failed
- 1013: Proposal not passed
- 1014: Invalid lockup period
- 1015: Stake not found
- 1016: Tokens still locked

## Rate Limits

- 2 second cooldown between chaos requests
- Maximum 3 requests per minute per address
- 1 proposal per address per day
- Voting cooldown period between votes
- Maximum 10 active proposals at once
- Staking lockup period: 1 day to 1 year

## Best Practices

1. Always handle errors appropriately:
```typescript
try {
    const request = await sdk.createChaosRequest(params);
    const result = await request.waitForCompletion();
} catch (error) {
    if (error instanceof GlitchError) {
        // Handle specific error cases
    } else {
        // Handle unexpected errors
    }
}
```

2. Use appropriate test durations:
```typescript
// Start with shorter tests
const request = await sdk.createChaosRequest({
    ...params,
    duration: 60,    // Start with 1 minute
    intensity: 1     // Start with low intensity
});

// Then scale up
const fullTest = await sdk.createChaosRequest({
    ...params,
    duration: 300,   // Increase to 5 minutes
    intensity: 5     // Increase intensity
});
```

3. Monitor test results:
```typescript
const request = await sdk.createChaosRequest(params);
const result = await request.waitForCompletion();

if (result.metrics && result.metrics.errorRate > 0.1) {
    console.warn('High error rate detected:', result.metrics);
}
```

## Examples

See the [examples directory](../examples) for complete usage examples:
- `quick-test.ts`: Simple test using an ephemeral wallet
- `basic-test.ts`: More detailed test with custom parameters
- `governance-proposal.ts`: Example of creating a governance proposal
