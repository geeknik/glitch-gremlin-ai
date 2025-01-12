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
- Real-time monitoring and alerts
- Automated proposal execution
- Multi-sig security for critical operations

## Governance Architecture

### Core Components
1. ProposalManager
   - Handles proposal lifecycle
   - Manages proposal metadata
   - Enforces creation rules
2. VoteTracker
   - Manages voting and tallying
   - Enforces voting rules
   - Calculates voting power
3. StakingPool
   - Handles token staking
   - Manages lockup periods
   - Distributes rewards
4. DelegationManager
   - Manages voting power delegation
   - Tracks delegated votes
   - Enforces delegation rules
5. TreasuryManager
   - Manages protocol funds
   - Handles allocations
   - Enforces spending limits

### Security Features
- Multi-sig for critical operations
- Timelock for parameter changes
- Rate limiting for all operations
- Circuit breaker for emergencies
- Comprehensive access controls
- Real-time monitoring
- Automated alerts
- Incident response plan

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
  - Budget requirements
  - Implementation timeline

### 2. Voting Period
- Duration: 3 days (configurable)
- Quorum: 10% of circulating supply
- Vote options: Yes/No/Abstain
- Voting power based on staked amount
- Delegated votes allowed
- Real-time vote tracking
- Transparent tallying

### 3. Execution
- Successful proposals enter timelock
- Execution delay: 24 hours
- Multi-sig execution for security
- Automated execution for simple proposals
- Failed proposals refund stake
- Comprehensive logging

## Integration Guide

### Governance Worker
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

### Explorer Integration
```typescript
// Get all proposals
const proposals = await worker.getProposals()

// Get proposal details
const proposal = await worker.getProposal(proposalId)

// Get voting results
const results = await worker.getVoteResults(proposalId)

// Get staking info
const stakingInfo = await worker.getStakingInfo(address)
```

## Staking & Treasury Management

### Staking
- Minimum stake: 1000 GREMLINAI
- Maximum stake: 1M GREMLINAI per address
- Lockup periods: 1 day to 1 year
- SP00GE token holder benefits:
  - 2x voting power multiplier for SP00GE holders
  - 25% bonus on staking rewards
  - Early access to new features
  - Exclusive governance proposals
- Higher voting power with longer lockups
- Rewards from protocol fees
- Early unstake penalty (50% of staked amount)
- Delegated staking support
- Auto-compounding rewards
- Real-time staking metrics
- Staking tiers with bonus rewards:
  - Bronze: 1k-10k GREMLINAI
  - Silver: 10k-100k GREMLINAI  
  - Gold: 100k+ GREMLINAI

### Treasury Management
- Multi-sig controlled (3/5 signatures)
- Funds allocated for:
  - Governance proposals
  - Community initiatives
  - Protocol development
  - Emergency reserves
- Transparent allocation tracking
- Monthly treasury reports
- Allocation limits per period
- Comprehensive audit trail

## Rate Limits
- 1 proposal per address per day
- 2 second cooldown between chaos requests
- Maximum 3 requests per minute
- Maximum 10 active proposals at once
- Cooldown period enforced between votes
- Exponential backoff for rate limiting

## Rewards
- Proposal creators: 5% of test fees
- Voters: Share of 2% fee pool
- Stakers: APY based on lockup duration
- Delegators: Share of staking rewards
- Community contributors: Grants from treasury

## Security Best Practices
1. Use multi-sig for all privileged operations
2. Enable timelock for critical changes
3. Monitor governance activity in real-time
4. Use rate limiting to prevent abuse
5. Implement emergency pause functionality
6. Conduct regular security audits
7. Maintain comprehensive documentation
8. Use automated monitoring and alerts
9. Implement incident response procedures
10. Conduct regular security training

## Next Steps
- [Review Governance Smart Contracts](./governance-contracts.md)
- [Explore Governance API](./governance-api.md)
- [Learn About Staking](./staking.md)
- [Understand Treasury Management](./treasury.md)
