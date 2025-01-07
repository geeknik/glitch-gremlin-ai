# Glitch Gremlin AI Explorer

A blockchain explorer for monitoring Chaos Requests and Governance Proposals.

## Features

- Search for Chaos Requests by ID or address
- View detailed request information including:
  - Test type (FUZZ, LOAD, EXPLOIT, CONCURRENCY)
  - Duration and intensity
  - Status (Pending, In Progress, Completed, Failed)
  - Metrics (Transactions, Errors, Latency)
- View network statistics:
  - Total requests
  - Active requests
  - Recent activity
- Monitor governance proposals:
  - Proposal status
  - Voting results
  - Execution status

## Development

### Prerequisites

- Node.js v16+
- npm or yarn

### Installation

```bash
npm install
```

### Running Locally

```bash
npm start
```

The explorer will be available at http://localhost:3000

### Building for Production

```bash
npm run build
```

## API Integration

The explorer integrates with the Glitch Gremlin AI API to fetch real-time data. See the [API Documentation](https://api.glitchgremlin.ai/docs) for more details.

## Contributing

Contributions are welcome! Please follow the [contribution guidelines](CONTRIBUTING.md).

## License

MIT
