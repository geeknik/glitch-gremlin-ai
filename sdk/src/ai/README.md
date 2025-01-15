# AI Security Analysis Module

A comprehensive AI-powered security analysis toolkit for blockchain programs, featuring anomaly detection, vulnerability scanning, and intelligent fuzzing capabilities.

## Features

- **Anomaly Detection**: Real-time monitoring of program behavior using neural networks
- **Vulnerability Detection**: ML-powered vulnerability scanning and classification
- **Intelligent Fuzzing**: AI-guided fuzzing for discovering potential vulnerabilities
- **Time Series Analysis**: Advanced pattern recognition in program execution metrics
- **Security Pattern Detection**: Sophisticated detection of security patterns and anti-patterns
- **Authority Validation**: Deep analysis of authority checks and permission patterns
- **PDA Verification**: Automated validation of Program Derived Addresses
- **CPI Safety Checks**: Comprehensive Cross-Program Invocation safety analysis

## Quick Start

```typescript
import { AnomalyDetectionModel } from './anomaly-detection';

// Initialize the model
const model = new AnomalyDetectionModel();

// Train with historical data
await model.train(historicalMetrics);

// Monitor for anomalies
const result = await model.detect(currentMetrics);
if (result.isAnomaly) {
    console.log('Anomaly detected:', result.details);
}
```

## Installation

```bash
npm install @solana/security-ai-toolkit
```

## Basic Usage

1. **Setup Anomaly Detection**:
```typescript
import { AnomalyDetectionModel } from '@solana/security-ai-toolkit';

const config = {
    windowSize: 100,
    trainingEpochs: 50,
    batchSize: 32,
    learningRate: 0.001,
    securityPatternDetection: true,
    authorityValidation: true,
    pdaVerification: true,
    cpiSafetyChecks: true
};

const detector = new AnomalyDetectionModel(config);
```

2. **Configure Metrics Collection**:
```typescript
const metrics = {
    instructionFrequency: [/* metrics */],
    executionTime: [/* metrics */],
    memoryUsage: [/* metrics */],
    cpuUtilization: [/* metrics */],
    errorRate: [/* metrics */],
    pdaValidation: [/* metrics */],
    accountDataMatching: [/* metrics */],
    cpiSafety: [/* metrics */],
    authorityChecks: [/* metrics */]
};
```

3. **Train and Monitor**:
```typescript
await detector.train(trainingData);
const anomalies = await detector.detect(metrics);
```

## Documentation

- [Detailed Documentation](docs/ai-module.md)
- [API Reference](docs/api-reference.md)
- [Best Practices](docs/best-practices.md)

## Performance Considerations

- Recommended minimum training data: 5000 data points
- Optimal monitoring window: 200 time steps
- Resource requirements:
    - Memory: 4GB RAM minimum
    - Storage: 1GB for model storage
    - GPU: Recommended for training (CUDA compatible)
- Training time: 15-30 minutes on GPU, 1-2 hours on CPU
- Inference time: <100ms per prediction

## Security Pattern Detection

The module now includes advanced security pattern detection:

```typescript
// Enable security pattern detection
const securityPatterns = await detector.analyzeSecurityPatterns(program);

// Check for specific patterns
if (securityPatterns.hasUnsafeAuthority) {
    console.warn('Unsafe authority validation pattern detected:', 
        securityPatterns.authorityIssues);
}

// Validate PDA usage
const pdaValidation = await detector.validatePDAUsage(program);
if (!pdaValidation.isValid) {
    console.error('PDA validation failed:', pdaValidation.issues);
}

// Check CPI safety
const cpiSafety = await detector.analyzeCPISafety(program);
if (!cpiSafety.isSafe) {
    console.error('CPI safety issues found:', cpiSafety.violations);
}
```

## Error Handling

The module includes comprehensive error handling with detailed error messages:

```typescript
try {
    await detector.train(data);
} catch (error) {
    console.error('Training error:', error.message);
}
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

