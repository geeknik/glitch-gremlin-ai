# Glitch Gremlin zkVM Integration

## Overview

The Glitch Gremlin AI platform integrates with Nexus zkVM to provide enhanced privacy and security for chaos testing. This integration allows tests to run in a zero-knowledge environment, generating cryptographic proofs of test execution without revealing sensitive details.

## Features

- Isolated test execution in zkVM environment
- Cryptographic proofs of test completion
- Enhanced privacy for test parameters and results
- Compatible with all existing test types

## Configuration

Enable zkVM execution by setting the environment variable:

```bash
export USE_ZKVM=true
```

### Prerequisites

1. Install Nexus zkVM:
```bash
cargo install nexus-zkvm
```

2. Configure zkVM environment:
```bash
nexus config init
```

## Architecture

The zkVM integration consists of three main components:

1. ZkVMExecutor: Manages test execution in the zkVM environment
2. Proof Generation: Creates cryptographic proofs of test completion
3. Result Verification: Validates proofs on-chain

## Usage Example

```typescript
import { GlitchSDK, TestType } from '@glitch-gremlin/sdk';

const sdk = new GlitchSDK({
    cluster: 'devnet',
    wallet: yourWallet,
    useZkVM: true  // Enable zkVM execution
});

const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: TestType.EXPLOIT,
    duration: 300,
    intensity: 7,
    params: {
        zkvm: {
            proofType: 'full',  // or 'light' for faster verification
            confidential: true  // Hide test parameters
        }
    }
});

// Results will include a cryptographic proof
const results = await request.waitForCompletion();
console.log('Proof:', results.proof);
```

## Security Considerations

1. Proof Verification
   - All proofs are verified on-chain before finalizing results
   - Invalid proofs result in test failure
   - Proof verification adds ~2-5 seconds to completion time

2. Data Privacy
   - Test parameters are encrypted in the zkVM
   - Results contain only the proof and basic metrics
   - Full logs available only to test requestor

3. Resource Limits
   - Maximum test duration: 1 hour
   - Maximum program size: 10MB
   - Memory limit: 4GB per test

## Best Practices

1. Start with shorter tests while learning zkVM integration
2. Monitor resource usage - zkVM execution is more intensive
3. Keep test programs minimal - include only necessary logic
4. Store proof verification keys securely
5. Implement proper error handling for proof verification

## Troubleshooting

Common issues and solutions:

1. Proof Generation Fails
   ```
   Error: Failed to generate proof
   ```
   - Check zkVM installation
   - Verify program size limits
   - Monitor system resources

2. Verification Timeout
   ```
   Error: Proof verification timeout
   ```
   - Increase timeout settings
   - Try 'light' proof type
   - Reduce test complexity

3. Memory Errors
   ```
   Error: Out of memory
   ```
   - Reduce test duration
   - Decrease parallel operations
   - Monitor zkVM memory usage

## Next Steps

- Review [Test Types](./test-types.md) for zkVM compatibility
- Learn about [Proof Types](./proof-types.md)
- Explore [Advanced Configuration](./advanced-config.md)
