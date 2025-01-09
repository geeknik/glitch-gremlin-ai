# Glitch Gremlin AI - Verified Package Versions

This document tracks the verified working versions of critical dependencies.

## Solana Wallet Adapters

### Last Verified: 2025-01-09

- `@solana/wallet-adapter-base`: 0.9.23
- `@solana/wallet-adapter-wallets`: 0.19.32
- `@solana/wallet-adapter-vue`: 0.9.22
- `@solana/wallet-adapter-vue-ui`: 0.9.22
- `@solana/web3.js`: 1.87.6 (pinned)

### Known Issues
- WalletConnect integration has dependency conflicts with @solana/web3.js versions
- Current workaround: Pin all wallet adapter packages to versions compatible with web3.js@1.87.6
- Tracking issue: Monitor for updated wallet adapter versions that resolve dependency conflicts

## Update Policy

These versions should only be changed after:
1. Thorough testing in a development environment
2. Verification of compatibility with all dependent packages
3. Approval from the core development team

Any version changes must be documented here with:
- New version number
- Date of change
- Reason for change
- Testing results
