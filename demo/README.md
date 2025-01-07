# Glitch Gremlin AI Demo

This demo showcases the end-to-end functionality of Glitch Gremlin AI, including:

1. Wallet connection
2. Chaos request creation
3. Request monitoring
4. Governance proposal creation
5. Voting

## Prerequisites

- Node.js v18+
- Solana CLI installed
- Devnet SOL (for test transactions)

## Setup

1. Install dependencies:
```bash
npm install @glitch-gremlin/sdk @solana/web3.js chalk
```

2. Run the demo:
```bash
npx ts-node demo.ts
```

## Demo Flow

1. **Environment Setup**
   - Initialize SDK
   - Connect to Solana devnet

2. **Wallet Connection**
   - Generate test wallet
   - Check balance

3. **Chaos Request**
   - Create fuzz test request
   - Monitor request status
   - View results

4. **Governance**
   - Create test proposal
   - Cast vote
   - View proposal status
