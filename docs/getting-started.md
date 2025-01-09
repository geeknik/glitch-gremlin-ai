# Getting Started with Glitch Gremlin AI

## Prerequisites
- Node.js 16+
- A Solana wallet with some $GREMLINAI tokens
- Reown project ID (get from https://cloud.reown.com)

## Wallet Setup
Install required packages:
```bash
npm install @reown/appkit @reown/appkit-adapter-solana @solana/wallet-adapter-wallets
```

Basic setup:
```typescript
import { createAppKit } from '@reown/appkit-solana/vue'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/vue'
import { solanaDevnet } from '@reown/appkit/networks'

const projectId = 'YOUR_REOWN_PROJECT_ID'

const solanaWeb3JsAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()]
})

createAppKit({
  adapters: [solanaWeb3JsAdapter],
  metadata: {
    name: 'Glitch Gremlin',
    description: 'Chaos Testing Platform',
    url: window.location.origin,
    icons: ['https://glitchgremlin.ai/logo.png']
  },
  networks: [solanaDevnet],
  projectId,
  wallets: [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ]
})
```

## Test Coverage
Our SDK has been thoroughly tested with:
- Core SDK functionality (10 tests)
- Governance features (4 tests)
- Redis worker integration (2 tests)

## Installation

### SDK Installation
```bash
npm install @glitch-gremlin/sdk
```

### CLI Installation
```bash
npm install -g @glitch-gremlin/cli

# Configure your Solana environment
export SOLANA_CLUSTER=devnet  # or mainnet-beta
export SOLANA_KEYPAIR_PATH=/path/to/your/keypair.json
```

The CLI requires these environment variables:
- `SOLANA_CLUSTER`: The Solana cluster to connect to ('devnet' or 'mainnet-beta')
- `SOLANA_KEYPAIR_PATH`: Path to your Solana keypair file

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
