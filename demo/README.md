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

## Recording Tips

- Use a terminal with good contrast for recording
- Highlight key interactions with chalk colors
- Pause between steps to explain functionality
- Show console output for each operation
</source>
</source>

Let's also add a demo script to package.json:

package.json
<source>json
<<<<<<< SEARCH
  "scripts": {
    "clean": "rm -rf node_modules package-lock.json sdk/dist cli/dist",
    "build": "npm run build-sdk && npm run build-cli",
    "build-sdk": "cd sdk && npm install && npm run build",
    "build-cli": "cd cli && npm install && npm run build",
    "test": "npm run test --workspaces --if-present",
    "test:coverage": "npm run test:coverage --workspaces --if-present",
    "lint": "npm run lint --workspaces",
    "demo": "NODE_OPTIONS='--loader ts-node/esm' ts-node --esm demo.ts"
  },
