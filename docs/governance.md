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

## Community Chaos Challenges

### Challenge Structure
```typescript
interface ChaosChallenge {
  id: string;
  title: string;
  description: string;
  targetProgram: string;
  testType: TestType;
  duration: number;
  intensity: number;
  budget: number;
  creator: string;
  status: 'pending' | 'active' | 'completed';
  startTime: number;
  endTime: number;
  participants: string[];
  results: ChaosChallengeResult[];
}

interface ChaosChallengeResult {
  participant: string;
  score: number;
  findings: VulnerabilityFinding[];
  rewards: number;
}

interface VulnerabilityFinding {
  type: VulnerabilityType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
}
```

### Challenge Lifecycle
1. Proposal Creation
   - Minimum stake: 5000 GREMLINAI
   - Must specify target program and test parameters
   - Budget must be crowdfunded within 7 days
2. Voting Period
   - Duration: 3 days
   - Quorum: 15% of circulating supply
3. Execution
   - Challenge runs for specified duration
   - Participants submit findings
   - Results are verified and scored
   - Rewards distributed automatically

## Governance Lifecycle

### 1. Proposal Creation
- Minimum stake: 1000 GREMLINAI
- Proposal types:
  - Protocol parameter changes
  - Treasury allocations
  - Chaos test campaigns
    - Community Chaos Challenges
      - Public voting on target programs
      - Crowdfunded testing campaigns
      - Leaderboard for top contributors
      - Reward distribution for participants
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
  - Verified through on-chain SP00GE balance checks
- Higher voting power with longer lockups:
  - 1-30 days: 1x
  - 31-90 days: 1.5x
  - 91-365 days: 2x
- Rewards from protocol fees:
  - Distributed daily
  - Auto-compounding option
  - Minimum claim threshold: 100 GREMLINAI
- Early unstake penalty (50% of staked amount)
- Delegated staking support:
  - Delegation limits per address
  - Delegation cooldown period
  - Delegation fee: 5% of rewards
- Staking tiers with bonus rewards:
  - Bronze: 1k-10k GREMLINAI (5% bonus)
  - Silver: 10k-100k GREMLINAI (10% bonus)
  - Gold: 100k+ GREMLINAI (15% bonus)
  - Tier verification through on-chain checks

### Treasury Management
- Multi-sig controlled (3/5 signatures)
- Funds allocated for:
  - Governance proposals (max 50% per quarter)
  - Community initiatives (max 20% per quarter)
  - Protocol development (max 25% per quarter)
  - Emergency reserves (min 5% always maintained)
- Allocation limits:
  - Max single allocation: 10% of treasury
  - Min allocation size: 1000 GREMLINAI
  - Cooldown period between allocations: 7 days
- Emergency pause functionality:
  - Immediate halt of all treasury operations
  - Requires 3/5 multisig approval
  - Maximum pause duration: 7 days
  - Automatic unpause after duration
  - Comprehensive logging of pause events
- Transparent allocation tracking:
  - On-chain records of all transactions
  - Monthly treasury reports
  - Quarterly audits
  - Public dashboard for real-time tracking

## Rate Limits
- 1 proposal per address per day
- 2 second cooldown between chaos requests
- Maximum 3 requests per minute
- Maximum 10 active proposals at once
- Cooldown period enforced between votes
- Exponential backoff for rate limiting

## Rewards
- Proposal creators: 5% of test fees
  - Distributed upon proposal execution
  - Minimum threshold: 100 GREMLINAI
- Voters: Share of 2% fee pool
  - Distributed proportionally to voting power
  - Minimum threshold: 50 GREMLINAI
- Stakers: APY based on lockup duration
  - 1-30 days: 5% APY
  - 31-90 days: 7% APY
  - 91-365 days: 10% APY
  - SP00GE holders: +25% bonus
- Delegators: Share of staking rewards
  - 5% delegation fee deducted
  - Minimum threshold: 100 GREMLINAI
- Community contributors: Grants from treasury
  - Max grant size: 10% of treasury
  - Min grant size: 1000 GREMLINAI
  - Requires governance approval
  - Quarterly grant allocation limit: 20% of treasury

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
