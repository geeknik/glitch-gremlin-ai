# Glitch Gremlin SDK

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

The official SDK for interacting with Glitch Gremlin AI's Chaos-as-a-Service platform on Solana.

## Installation

```bash
npm install @glitch-gremlin/sdk
```

## Quick Start

```typescript
import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';

// Initialize SDK
const sdk = new GlitchSDK({
    cluster: 'devnet',
    wallet: yourWallet
});

// Create a chaos request
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: TestType.FUZZ,
    duration: 300,
    intensity: 5
});

// Monitor results
const results = await request.waitForCompletion();
```

## Features

- 🤖 AI-Driven Testing
- 🔒 Security First
- 📊 Real-time Monitoring
- 🏛️ Governance Integration
- 💰 Token Economics

## Documentation

See the [main documentation](../docs) for detailed guides and API reference.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see the [LICENSE](../LICENSE) file for details.
