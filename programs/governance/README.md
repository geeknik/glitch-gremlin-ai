# Glitch Gremlin Governance Program

The Glitch Gremlin Governance Program manages the decentralized governance of the Glitch Gremlin ecosystem, including chaos test proposals, voting, and treasury management.

## Features

- Token staking for governance participation
- Proposal creation for chaos tests
- Voting mechanism with delegation support
- Treasury management for funded chaos tests
- Configurable governance parameters

## Prerequisites

- Node.js v16+ and pnpm
- Rust and Cargo
- Solana Tool Suite
- Anchor Framework

## Installation

```bash
# Install dependencies
pnpm install

# Build the program
anchor build

# Run tests
anchor test
```

## Deployment

1. Set up environment variables:
```bash
export SOLANA_RPC_URL="your_rpc_url"
export DEPLOYER_KEYPAIR_PATH="/path/to/deployer-keypair.json"
```

2. Fund the deployer account:
```bash
solana airdrop 2 $(solana-keygen pubkey $DEPLOYER_KEYPAIR_PATH) --url devnet
```

3. Deploy the program:
```bash
pnpm run deploy
```

The deployment script will:
- Deploy the program
- Initialize governance with default parameters
- Save deployment information to `deployment-info.json`

## Configuration

Default governance parameters:
```typescript
{
    minStakeAmount: 1_000_000,        // 1 GREMLINAI
    minProposalStake: 5_000_000,      // 5 GREMLINAI
    votingPeriod: 604_800,            // 7 days
    quorumPercentage: 10,             // 10%
    approvalThresholdPercentage: 60,   // 60%
    executionDelay: 86_400,           // 24 hours
    stakeLockupDuration: 2_592_000,   // 30 days
}
```

## Security Considerations

1. Access Control
   - Only staked token holders can create proposals
   - Minimum stake requirements for proposal creation
   - Delegation controls

2. Treasury Protection
   - Multi-signature requirement for treasury operations
   - Funding limits per proposal
   - Execution delay for approved proposals

3. Voting Security
   - One token, one vote
   - Vote delegation controls
   - Quorum requirements
   - Approval thresholds

## Emergency Procedures

1. Critical Issues
   - Contact the emergency response team
   - Pause proposal execution if necessary
   - Prepare incident report

2. Non-Critical Issues
   - Submit bug report
   - Await review and prioritization
   - Follow standard update process

## Monitoring

Monitor the program using:
```bash
solana logs -u mainnet-beta $(solana-keygen pubkey program-keypair.json)
```

## Testing

Run the test suite:
```bash
anchor test
```

This will run:
- Unit tests
- Integration tests
- Security tests
- Edge case tests

## Support

For support:
1. Check the documentation
2. Join our Discord server
3. Open a GitHub issue
4. Contact the development team

## License

MIT License 