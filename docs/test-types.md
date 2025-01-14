# Chaos Test Types

✅ All test suites passing (24 tests across 5 suites)

Glitch Gremlin AI supports several types of chaos testing to help identify different categories of vulnerabilities and issues in your Solana programs. All test types have been validated through our comprehensive test suite.

## Available Test Types

### 1. Advanced Fuzz Testing (FUZZ)
AI-driven fuzz testing that combines:
- Genetic algorithm for input generation
- Reinforcement learning for test optimization
- Coverage-guided exploration
- Context-aware mutation
- Smart seed selection

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

### 4. Advanced Concurrency Testing (CONCURRENCY)
Enhanced concurrency testing with:
- Race condition detection
- Deadlock prediction
- Resource contention analysis
- Transaction ordering simulation
- Cross-program interaction testing

### 5. State Transition Testing (STATE)
Analyzes program state changes with:
- State space exploration
- Invalid state detection
- State transition validation
- State consistency checks
- State rollback testing

### 6. Economic Attack Testing (ECONOMIC)
Simulates economic attacks including:
- Flash loan attacks
- Price manipulation
- Fee extraction
- Token inflation
- Reward system exploits

### 7. Cross-Program Testing (CROSS)
Tests interactions between programs:
- CPI (Cross-Program Invocation) validation
- Shared account analysis
- Program dependency testing
- Privilege escalation detection
- Data consistency checks

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
- `mlEnabled`: Enable AI-driven vulnerability detection (default: true)
- `mlConfidenceThreshold`: Minimum confidence score for ML predictions (default: 0.7)

### ML Model Parameters
The AI engine uses a neural network model to detect potential vulnerabilities:

```typescript
const request = await sdk.createChaosRequest({
    targetProgram: "Your program ID",
    testType: TestType.EXPLOIT,
    duration: 300,
    intensity: 7,
    params: {
        mlConfig: {
            confidenceThreshold: 0.8,
            featureExtraction: {
                includeStaticAnalysis: true,
                includeDynamicTraces: true
            }
        }
    }
});
```

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
