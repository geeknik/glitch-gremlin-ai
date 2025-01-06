# Governance Features

## Overview
The Glitch Gremlin governance system allows token holders to participate in decision-making through a democratic process. Holders can stake tokens, create proposals, vote, and earn rewards for participation.

## Staking
- Minimum stake: 1000 GLITCH
- Lockup periods: 1 day to 1 year
- Higher voting power with longer lockups
- Rewards from protocol fees

## Proposals
1. Create a proposal (requires minimum stake)
2. Community voting period (3 days)
3. Execution delay (24 hours if passed)
4. Implementation by protocol

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
- Maximum 10 active proposals at once

## Rewards
- Proposal creators: 5% of test fees
- Voters: Share of 2% fee pool
- Stakers: APY based on lockup duration