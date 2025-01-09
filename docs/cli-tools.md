# Glitch Gremlin CLI Tools

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](../cli/package.json)

## Installation

```bash
npm install -g @glitch-gremlin/cli
```

## Environment Setup

The CLI requires these environment variables:
- `SOLANA_KEYPAIR_PATH`: Path to your Solana keypair file
- `SOLANA_CLUSTER`: (Optional) Solana cluster to use (defaults to 'devnet')

## Commands

### Test Management

```bash
# Create a new chaos test
glitch test -p <program-id> -t FUZZ -d 300 -i 5

# Options:
#   -p, --program <address>    Target program address
#   -t, --type <type>         Test type (FUZZ, LOAD, EXPLOIT, CONCURRENCY)
#   -d, --duration <seconds>   Test duration in seconds (default: 300)
#   -i, --intensity <level>    Test intensity 1-10 (default: 5)

# View test results
glitch test results <test-id>

# Cancel a running test
glitch test cancel <test-id>
```

### Governance

```bash
# Create a proposal
glitch governance propose \
  -t "Test Title" \
  -d "Description" \
  -p <program-id> \
  -s 1000

# Options:
#   -t, --title <title>       Proposal title
#   -d, --description <desc>  Proposal description
#   -p, --program <address>   Target program address
#   -s, --stake <amount>      Amount of GREMLINAI to stake

# Vote on a proposal
glitch governance vote -p <proposal-id> -v yes

# Execute a passed proposal
glitch governance execute <proposal-id>
```

### Token Management

```bash
# Stake tokens
glitch stake <amount> --lockup 30d [--delegate <address>]

# Unstake tokens
glitch unstake <stake-id> [--force]

# Delegate stake
glitch stake delegate <stake-id> <delegate-address>

# Claim rewards
glitch stake claim <stake-id>

# View staking info
glitch stake info <stake-id> [--rewards]
```

## Examples

### Basic Fuzz Test
```bash
# Run a 5-minute fuzz test with medium intensity
glitch test \
  --program 11111111111111111111111111111111 \
  --type FUZZ \
  --duration 300 \
  --intensity 5
```

### Load Test
```bash
# Run a high-intensity load test
glitch test \
  --program YOUR_PROGRAM_ID \
  --type LOAD \
  --duration 600 \
  --intensity 8 \
  --load-tps 5000
```

### Create and Monitor Proposal
```bash
# Create proposal
PROPOSAL_ID=$(glitch governance propose \
  -t "Test DEX Security" \
  -d "Run exploit tests on XYZ DEX" \
  -p DEX_PROGRAM_ID \
  -s 1000)

# Monitor status
glitch governance status $PROPOSAL_ID
```

## Error Handling

The CLI will display clear error messages for common issues:
- Invalid parameters
- Network connectivity problems
- Insufficient token balance
- Rate limiting
- Permission denied

Example error output:
```
Error: Rate limit exceeded - Must wait 2s between requests
Error: Insufficient GLITCH balance - Required: 1000, Available: 500
Error: Invalid program address provided
```

## Configuration

The CLI looks for configuration in this order:
1. Command line arguments
2. Environment variables
3. Configuration file (~/.config/glitch/config.json)

Example config file:
```json
{
  "cluster": "devnet",
  "keypairPath": "~/.config/solana/id.json",
  "defaultTestDuration": 300,
  "defaultTestIntensity": 5
}
```

## Best Practices

1. Start with short duration, low intensity tests
2. Use devnet for initial testing
3. Monitor test results in real-time
4. Save test IDs for future reference
5. Use appropriate test types for your use case

## Next Steps
- Read the [SDK Reference](./sdk-reference.md)
- Learn about [Test Types](./test-types.md)
- Explore [Governance](./governance.md)
