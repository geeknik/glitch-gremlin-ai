# 👹 Glitch Gremlin AI - Embrace The Chaos!

[![Tests](https://img.shields.io/badge/tests-24%20passed-brightgreen.svg)](./test-results.md)
[![Documentation](https://img.shields.io/badge/docs-gitbook-blue)](https://ggai.gitbook.io/ggai-docs)

## Overview
$GREMLINAI is more than just another memecoin - it's a revolutionary Chaos-as-a-Service (CaaS) platform that helps developers stress-test their Solana dApps through controlled chaos. Our AI-powered Glitch Gremlin creates unpredictable scenarios and simulates real-world attacks, helping you build more resilient applications.

**Follow us to stay up to date:**
- [X (Twitter)](https://x.com/glitchgremlinai)
- [GitHub](https://github.com/geeknik/glitch-gremlin-ai)

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

Check out our [examples directory](../examples) for more sample code:
- `quick-test.ts`: Simple test using an ephemeral wallet
- `basic-test.ts`: More detailed test with custom parameters
- `governance-proposal.ts`: Example of creating a governance proposal

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
