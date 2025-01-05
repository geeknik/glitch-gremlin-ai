# Glitch Gremlin AI Documentation

## Overview
Glitch Gremlin AI provides Chaos-as-a-Service (CaaS) for Solana dApps through a combination of on-chain programs and off-chain AI testing capabilities.

## Quick Start
```typescript
import { GlitchSDK } from '@glitch-gremlin/sdk';

// Initialize SDK
const sdk = new GlitchSDK({
    cluster: 'devnet',
    wallet: yourWallet
});

// Create a chaos request
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: "FUZZ",
    duration: 300, // 5 minutes
    intensity: 5
});

// Monitor results
const results = await request.waitForCompletion();
```

## Installation

```bash
npm install @glitch-gremlin/sdk
# or
yarn add @glitch-gremlin/sdk
```

## Documentation Sections
- [Getting Started](./getting-started.md)
- [SDK Reference](./sdk-reference.md)
- [CLI Tools](./cli-tools.md)
- [Chaos Test Types](./test-types.md)
- [Governance](./governance.md)
