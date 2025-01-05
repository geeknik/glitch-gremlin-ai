# Getting Started with Glitch Gremlin AI

## Prerequisites
- Solana CLI tools installed
- Node.js 14+ 
- A Solana wallet with some $GLITCH tokens

## Installation

### SDK Installation
```bash
npm install @glitch-gremlin/sdk
```

### CLI Installation
```bash
npm install -g @glitch-gremlin/cli
```

## Basic Usage

### 1. Initialize the SDK
```typescript
import { GlitchSDK } from '@glitch-gremlin/sdk';

const sdk = new GlitchSDK({
    cluster: 'devnet',  // or 'mainnet-beta'
    wallet: yourWallet  // Your Solana wallet instance
});
```

### 2. Create Your First Chaos Test
```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: "FUZZ",
    duration: 300,  // 5 minutes
    intensity: 5    // Scale of 1-10
});

// Wait for results
const results = await request.waitForCompletion();
console.log("Test Results:", results);
```

### 3. Using the CLI
```bash
# Initialize a new chaos test
glitch test create --program <PROGRAM_ID> --type FUZZ

# Check test status
glitch test status <TEST_ID>

# View test results
glitch test results <TEST_ID>
```

## Next Steps
- Explore different [test types](./test-types.md)
- Learn about [governance](./governance.md)
- Set up [automated testing](./ci-cd.md)
