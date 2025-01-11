# Glitch Gremlin Mainnet Deployment Guide

## Prerequisites
- Solana CLI v1.8.0+ installed
- Mainnet RPC endpoint (dedicated recommended)
- 4/7 multisig wallet configured
- Minimum 50 SOL for deployment
- Mainnet keypair with deployment authority

## Deployment Steps

### 1. Build the Program
```bash
cd src/token/program
cargo build-bpf --release --features mainnet
```

### 2. Deploy to Mainnet
```bash
solana program deploy target/deploy/glitch_gremlin.so \
  --url mainnet-beta \
  --keypair ~/.config/solana/mainnet-keypair.json \
  --max-len 1048576 \
  --commitment confirmed
```

### 3. Set Program Authority
```bash
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --keypair ~/.config/solana/mainnet-keypair.json \
  --commitment confirmed
```

### 4. Verify Deployment
```bash
solana program show <PROGRAM_ID> --url mainnet-beta --output json
```

### 5. Initialize Program
```bash
glitch-cli initialize \
  --program-id <PROGRAM_ID> \
  --admin <MULTISIG_ADDRESS> \
  --fee-receiver <FEE_ADDRESS> \
  --network mainnet
```

## Mainnet Configuration

### Rate Limits
- Max requests: 10/min per IP
- Max tokens escrowed: 1M GLITCH
- Min request duration: 60s
- Max concurrent tasks: 100
- Min task latency: 1ms
- Max task duration: 5min

### Security Settings
- Circuit breaker threshold: 10% error rate
- Emergency pause cooldown: 15 minutes
- Rate limit backoff: exponential
- Max request size: 1MB

## Post-Deployment Checklist

1. Verify all program entry points
2. Test rate limiting and security features
3. Set up real-time monitoring
4. Configure alerts for critical metrics
5. Document deployment details
6. Verify multisig operations
7. Test emergency procedures

## Monitoring Setup

### Key Metrics
- Program activity (TPS, success rate)
- Error rates by type
- System performance (latency, CPU)
- Security events (failed attempts)

### Alert Thresholds
- Error rate > 5% for 5 minutes
- Latency > 1s for 1 minute
- CPU usage > 80% for 5 minutes
- Security events > 10/min

## Rollback Plan

1. Activate emergency pause
2. Redeploy previous version
3. Verify rollback success
4. Investigate root cause
5. Prepare fix and redeploy
6. Communicate with community

## Incident Response

1. Identify issue severity
2. Activate appropriate response
3. Notify stakeholders
4. Investigate and resolve
5. Post-mortem analysis
6. Implement preventive measures
