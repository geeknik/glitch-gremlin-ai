# GremlinAI Deployment Guide

## Critical Deployment Checklist

### 1. Wallet Preparation

```bash
# Generate governance wallets
solana-keygen new -o config/gov1.ggai.json --no-bip39-passphrase --force
solana-keygen new -o config/gov2.ggai.json --no-bip39-passphrase --force
solana-keygen new -o config/gov3.ggai.json --no-bip39-passphrase --force
# ... Generate remaining wallets ...

# Set strict permissions
chmod 600 config/*.ggai.json
```

### 2. Multisig Verification

```typescript
// Verify before deployment
const requiredSigners = await Multisig.getSigners(
  programId, 
  connection
);
assert(requiredSigners.length === 10);
```

### 3. Post-Deployment

```bash
# Rotate genesis keys
npx ts-node scripts/rotate-keys.ts \
  --old-config config/multisig.json \
  --new-config config/multisig.v2.json
```

### 4. Emergency Protocol

The emergency override requires:
- 10/10 multisig approval
- TEE attestation
- Hardware security module validation

### Final Verification Steps

1. Test with mock wallets in CI:
```bash
MOCK_WALLETS=1 npm run test:deployment
```

2. Dry-run upgrade flow:
```typescript
await simulateUpgrade({
  programId: GOV_PROGRAM_ID,
  multisigConfig,
  testMode: true
});
```

## Security Requirements

1. All wallet files must have 600 permissions
2. Hardware security module must be configured
3. TEE attestation must be verified
4. All 10 multisig members must be properly initialized
5. Emergency override key must be stored in HSM

## Troubleshooting

If deployment fails:
1. Check wallet permissions
2. Verify HSM connection
3. Confirm all multisig members are available
4. Review TEE attestation logs

## Emergency Contacts

Store emergency contact information in secure location, accessible to authorized team members only.
