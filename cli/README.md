# Glitch Gremlin CLI

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

Command line interface for Glitch Gremlin AI's Chaos-as-a-Service platform.

## Installation

```bash
npm install -g @glitch-gremlin/cli
```

## Usage

```bash
# Run a basic fuzz test
glitch test -p <program-id> -t FUZZ -d 300 -i 5

# Create a governance proposal
glitch governance propose -t "Test Title" -d "Description" -p <program-id> -s 1000

# Vote on a proposal
glitch governance vote -p <proposal-id> -v yes

# View test results
glitch test results <test-id>
```

## Environment Setup

The CLI requires these environment variables:
- `SOLANA_KEYPAIR_PATH`: Path to your Solana keypair file
- `SOLANA_CLUSTER`: (Optional) Solana cluster to use (defaults to 'devnet')

## Features

- 🚀 Easy-to-use commands
- 🔐 Secure key management
- 📊 Results visualization
- 🏛️ Governance integration

## Documentation

See the [main documentation](../docs) for detailed guides and command reference.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see the [LICENSE](../LICENSE) file for details.
