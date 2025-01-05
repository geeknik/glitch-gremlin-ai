# Chaos Test Types

Glitch Gremlin AI supports several types of chaos testing to help identify different categories of vulnerabilities and issues in your Solana programs.

## Available Test Types

### 1. Fuzz Testing (FUZZ)
Automatically generates random or semi-random inputs to program instructions to find edge cases and unexpected behaviors.

```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: "FUZZ",
    duration: 300,
    intensity: 5,
    params: {
        instructionTypes: ["all"], // or specific instructions
        seedRange: [0, 1000000]
    }
});
```

### 2. Load Testing (LOAD)
Simulates high transaction volume to identify performance bottlenecks and concurrency issues.

```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: "LOAD",
    duration: 600,
    intensity: 8,
    params: {
        tps: 5000,
        rampUp: true
    }
});
```

### 3. Exploit Testing (EXPLOIT)
Attempts known exploit patterns to verify program security.

```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: "EXPLOIT",
    duration: 300,
    intensity: 7,
    params: {
        categories: ["reentrancy", "arithmetic"]
    }
});
```

### 4. Concurrency Testing (CONCURRENCY)
Tests program behavior under parallel transaction scenarios.

```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: "CONCURRENCY",
    duration: 300,
    intensity: 6,
    params: {
        parallel: 10,
        conflictRate: 0.5
    }
});
```

## Test Parameters

### Common Parameters
- `duration`: Test duration in seconds
- `intensity`: Scale of 1-10, affects how aggressive the testing is
- `params`: Optional test-specific parameters

### Test-Specific Parameters
Each test type accepts specific parameters to customize the testing behavior. See the examples above for type-specific parameters.

## Best Practices

1. Start with lower intensity values (1-3) and gradually increase
2. Run tests on devnet first before mainnet
3. Monitor program logs during testing
4. Review all test results carefully, even if no errors are reported

## Result Analysis

Test results include:
- Transaction statistics
- Error rates and types
- Performance metrics
- Specific vulnerability findings (if any)
- Recommendations for improvements

## Next Steps
- Learn about [automated testing integration](./ci-cd.md)
- Explore [governance](./governance.md) features
- Set up [monitoring](./monitoring.md)
