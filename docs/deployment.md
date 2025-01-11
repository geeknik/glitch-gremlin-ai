# Glitch Gremlin Deployment Guide

## Prerequisites
- Solana CLI installed and configured
- Mainnet RPC endpoint
- Multisig wallet setup
- Sufficient SOL for deployment

## Deployment Steps

### 1. Build the Program
```bash
cd src/token/program
cargo build-bpf --release
```

### 2. Deploy to Mainnet
```bash
solana program deploy target/deploy/glitch_gremlin.so \
  --url mainnet-beta \
  --keypair ~/.config/solana/mainnet-keypair.json
```

### 3. Set Program Authority
```bash
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --keypair ~/.config/solana/mainnet-keypair.json
```

### 4. Verify Deployment
```bash
solana program show <PROGRAM_ID> --url mainnet-beta
```

### 5. Initialize Program
```bash
glitch-cli initialize \
  --program-id <PROGRAM_ID> \
  --admin <MULTISIG_ADDRESS> \
  --fee-receiver <FEE_ADDRESS>
```

## Post-Deployment

1. Verify program functionality
2. Test all entry points
3. Monitor program activity
4. Set up monitoring and alerts
5. Document deployment details

## Rollback Plan

1. Pause program functionality
2. Redeploy previous version
3. Verify rollback success
4. Investigate root cause
5. Prepare fix and redeploy

## Monitoring

Set up monitoring for:
- Program activity
- Error rates
- Performance metrics
- Security events
