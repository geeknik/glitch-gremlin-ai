# Blockchain Monitoring and Automation Guide

This guide explains how Glitch Gremlin AI monitors the Solana blockchain for governance transactions and automates chaos testing using smolagents.

## Overview

The system consists of three main components:
1. Blockchain Monitor: Tracks governance and chaos request transactions
2. AI Engine: Processes chaos tests and interprets results
3. Automation Agent: Orchestrates the workflow using smolagents

## Setup Instructions

### 1. Install Dependencies
```bash
npm install @solana/web3.js
pip install smolagents
```

### 2. Configure Blockchain Connection
```typescript
// Import from existing SDK
import { GlitchSDK } from '../sdk/src/sdk';
import { Connection } from '@solana/web3.js';
import { PROGRAM_IDS } from '../config/program_ids.json';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const sdk = new GlitchSDK({
  programId: PROGRAM_IDS.main,
  connection
});
```

### 3. Set Up the AI Agent
```python
from smolagents import CodeAgent, HfApiModel
from worker.src.ai import AiEngine

class ChaosAgent(CodeAgent):
    def __init__(self, tools, model):
        super().__init__(tools=tools, model=model)
        self.ai_engine = AiEngine()

    def execute_test(self, test_params):
        return self.ai_engine.process_test(test_params)

agent = ChaosAgent(tools=[], model=HfApiModel())
```

## Monitoring Workflow

### 1. Subscribe to Program Events
```typescript
const monitor = sdk.createProgramMonitor();

monitor.on('newRequest', async (request) => {
  console.log('New chaos request:', request.id);
  await processRequest(request);
});

monitor.on('proposalCreated', async (proposal) => {
  console.log('New governance proposal:', proposal.id);
  await processProposal(proposal); 
});
```

### 2. Process Chaos Requests
```typescript
async function processRequest(request) {
  // Validate request parameters
  if (!validateRequest(request)) {
    throw new Error('Invalid request parameters');
  }

  // Execute test via AI agent
  const result = await agent.execute_test(request.params);

  // Update on-chain status
  await sdk.finalizeRequest(request.id, result);
}
```

### 3. Handle Governance Actions
```typescript
async function processProposal(proposal) {
  // Check proposal type
  if (proposal.type === 'CHAOS_TEST') {
    // Queue test for execution after voting period
    await sdk.queueProposalExecution(proposal.id);
  }

  // Monitor voting status
  const sub = monitor.watchProposal(proposal.id);
  sub.on('finalized', async (result) => {
    if (result.passed) {
      await executeProposal(proposal);
    }
  });
}
```

## Automation Features

### 1. Scheduled Testing
```typescript
const scheduler = sdk.createTestScheduler();

// Schedule recurring tests
scheduler.addRecurring({
  cronPattern: '0 0 * * *', // Daily
  testParams: {
    type: 'FUZZ',
    duration: 300,
    intensity: 5
  }
});
```

### 2. Conditional Testing
```typescript
monitor.addTrigger({
  condition: (tx) => tx.volume > 1000000, // High volume
  action: async () => {
    await sdk.createChaosRequest({
      type: 'LOAD',
      duration: 600,
      intensity: 8
    });
  }
});
```

### 3. AI-Driven Test Generation
```typescript
const aiScheduler = sdk.createAiScheduler();

aiScheduler.enableDynamicTesting({
  maxRequests: 10,
  minConfidence: 0.8,
  adaptiveIntensity: true
});
```

## Best Practices

1. Error Handling
```typescript
monitor.on('error', (error) => {
  console.error('Monitor error:', error);
  // Implement retry logic
  if (error.retryable) {
    monitor.retry();
  }
});
```

2. Resource Management
```typescript
// Clean up subscriptions
monitor.cleanup();
scheduler.stop();
aiScheduler.shutdown();
```

3. Monitoring Health
```typescript
const health = sdk.createHealthMonitor();

health.on('warning', (metric) => {
  console.warn('Health warning:', metric);
});

health.on('critical', async (metric) => {
  await monitor.pause();
  notifyAdmins(metric);
});
```

## Security Considerations

1. Rate Limiting
```typescript
const rateLimiter = sdk.createRateLimiter({
  maxRequests: 10,
  windowMs: 60000 // 1 minute
});
```

2. Access Control
```typescript
const acl = sdk.createAccessControl({
  allowedPrograms: ['program1', 'program2'],
  blockedAddresses: ['badActor1']
});
```

3. Validation
```typescript
function validateRequest(request) {
  return (
    request.duration <= 3600 && // Max 1 hour
    request.intensity <= 10 &&
    acl.isAllowed(request.program)
  );
}
```

## Next Steps

- Review [Test Types](./test-types.md) for automation compatibility
- Learn about [Governance Integration](./governance.md)
- Explore [Advanced Monitoring](./monitoring.md)
