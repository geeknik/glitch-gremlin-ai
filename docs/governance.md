# Governance Features

## Overview
The Glitch Gremlin governance system allows token holders to participate in decision-making through a democratic process. Key features include:

- On-chain proposal creation and voting
- Delegated voting power
- Staking with lockup periods
- Transparent vote tallying
- Timelock execution of passed proposals
- Emergency pause functionality
- Comprehensive security controls

## Governance Smart Contract Details

### Key Components
- ProposalManager: Handles proposal lifecycle
- VoteTracker: Manages voting and tallying
- StakingPool: Handles token staking and rewards
- DelegationManager: Manages voting power delegation

### Governance Worker Integration
The governance worker processes proposals and voting in real-time. To integrate:

```typescript
import { GovernanceWorker } from '@glitch-gremlin/governance-worker'
import { useAppKitAccount } from '@reown/appkit/vue'

const { address } = useAppKitAccount()

// Initialize worker
const worker = new GovernanceWorker({
  rpcUrl: 'https://api.devnet.solana.com',
  programId: 'GremlinGov11111111111111111111111111111111111',
  walletAddress: address
})

// Subscribe to governance events
worker.on('proposalCreated', (proposal) => {
  console.log('New proposal:', proposal)
})

worker.on('voteCast', (vote) => {
  console.log('Vote recorded:', vote)
})

// Start worker
await worker.start()
```

## Explorer Integration
To display governance data in your explorer:

```typescript
// Get all proposals
const proposals = await worker.getProposals()

// Get proposal details
const proposal = await worker.getProposal(proposalId)

// Get voting results
const results = await worker.getVoteResults(proposalId)
```

## Staking
- Minimum stake: 1000 GREMLINAI
- Lockup periods: 1 day to 1 year
- Higher voting power with longer lockups
- Rewards from protocol fees
- Staking contract fully implemented and tested
- Staking UI integrated in explorer
- Auto-compounding rewards
- Early unstake penalty (50% of staked amount)
- Delegated staking support

## Governance Lifecycle

### 1. Proposal Creation
- Minimum stake: 1000 GREMLINAI
- Proposal types:
  - Protocol parameter changes
  - Treasury allocations
  - Chaos test campaigns
  - Emergency measures
- Proposal metadata includes:
  - Title
  - Description
  - Target program (if applicable)
  - Test parameters (for chaos campaigns)
  - Execution instructions

### 2. Voting Period
- Duration: 3 days (configurable)
- Quorum: 10% of circulating supply
- Vote options: Yes/No/Abstain
- Voting power based on staked amount
- Delegated votes allowed

### 3. Execution
- Successful proposals enter timelock
- Execution delay: 24 hours
- Multisig execution for security
- Failed proposals refund stake

## Creating a Proposal
```typescript
const proposal = await sdk.createProposal({
    title: "Test Popular DEX",
    description: "Run chaos tests on XYZ DEX",
    targetProgram: "DEX_PROGRAM_ID",
    testParams: {
        testType: TestType.EXPLOIT,
        duration: 600,
        intensity: 8
    },
    stakingAmount: 1000
});
```

## Voting
```typescript
// Vote in favor
await sdk.vote(proposalId, true);

// Vote against
await sdk.vote(proposalId, false);
```

## Staking
```typescript
// Stake tokens for 30 days
await sdk.stakeTokens(1000, 30 * 24 * 60 * 60);

// Unstake after lockup period
await sdk.unstakeTokens(stakeId);
```

## Rate Limits
- 1 proposal per address per day
- 2 second cooldown between chaos requests
- Maximum 3 requests per minute
- Maximum 10 active proposals at once
- Cooldown period enforced between votes

## Rewards
- Proposal creators: 5% of test fees
- Voters: Share of 2% fee pool
- Stakers: APY based on lockup duration
