# Glitch Gremlin AI Listener Service Setup

The Glitch Gremlin AI listener service processes chaos test requests from CLI clients and coordinates with the AI engine. This guide explains how to deploy and configure the service.

## Prerequisites

- Node.js 16+ 
- Redis 6+
- Access to a Solana RPC node
- SSL certificate (recommended for production)

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/glitch-gremlin
cd glitch-gremlin

# Install dependencies
npm install

# Build the worker
cd worker && npm run build
```

## Configuration

Create a `.env` file in the worker directory:

```env
# Required
REDIS_URL=redis://localhost:6379
SOLANA_RPC=https://api.mainnet-beta.solana.com

# Optional
PORT=3000
LOG_LEVEL=info
MAX_CONCURRENT_TESTS=10
REQUEST_TIMEOUT=300000
```

## Running the Service

### Development
```bash
cd worker
npm run dev
```

### Production
We recommend using PM2 or similar process manager:

```bash
# Install PM2
npm install -g pm2

# Start the service
pm2 start dist/index.js --name glitch-listener

# Monitor logs
pm2 logs glitch-listener

# View status
pm2 status
```

## Health Checks

The service exposes these endpoints:

- `GET /health` - Basic health check
- `GET /metrics` - Prometheus metrics
- `GET /status` - Detailed service status

## Security Considerations

1. Rate Limiting
   - Requests are limited to 3 per minute per IP
   - Maximum 10 concurrent tests
   - 2 second cooldown between requests

2. Authentication
   - All requests must be signed with a valid Solana keypair
   - Token balance checks prevent spam

3. Network Security
   - Use SSL/TLS in production
   - Configure firewall rules
   - Restrict Redis access

## Monitoring

The service exports Prometheus metrics:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'glitch-gremlin'
    static_configs:
      - targets: ['localhost:3000']
```

Key metrics:
- `glitch_requests_total` - Total chaos requests
- `glitch_active_tests` - Currently running tests
- `glitch_queue_depth` - Request queue length
- `glitch_errors_total` - Error count by type

## Troubleshooting

Common issues and solutions:

1. Redis Connection Errors
   ```
   Error: Redis connection failed
   ```
   - Check Redis is running
   - Verify REDIS_URL in .env
   - Check network connectivity

2. RPC Node Issues
   ```
   Error: Failed to connect to Solana RPC
   ```
   - Verify RPC endpoint is accessible
   - Check rate limits
   - Consider using a dedicated RPC node

3. High Memory Usage
   - Reduce MAX_CONCURRENT_TESTS
   - Monitor Redis memory usage
   - Check for memory leaks

## Next Steps

- Set up [monitoring](./monitoring.md)
- Configure [automated backups](./backups.md)
- Review [security best practices](./security.md)
